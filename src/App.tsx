import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, Branch, Product, DeliveryOrder, UserRole, BranchDiscount, TransferDemand } from './types';
import BranchesTab from './components/BranchesTab';
import ProductsTab from './components/ProductsTab';
import DeliveriesTab from './components/DeliveriesTab';
import HospitalClientView from './components/HospitalClientView';
import UserManagementTab from './components/UserManagementTab';
import AnalyticsTab from './components/AnalyticsTab';
import DiscountsTab from './components/DiscountsTab';
import TransfersTab from './components/TransfersTab';

import { 
  Truck, Building2, ShoppingBag, ShieldCheck, 
  Users, LogOut, Loader2, Hospital, Key, Lock, 
  Mail, ClipboardCheck, ArrowRight, CheckCircle2, ShieldAlert,
  BarChart2, ChevronLeft, ChevronRight, Menu, X, Tag, ArrowRightLeft
} from 'lucide-react';

// High-fidelity fallback lists to ensure the interface is beautifully populated even if the client is offline
const DEFAULT_BRANCH_FALLBACKS: Branch[] = [
  {
    id: 'chicago-demo-id',
    name: 'Chicago Central Logistics Center',
    city: 'Chicago',
    address: '840 Logistics Way, Grid Sector 14A',
    contactPhone: '+1 (312) 555-0104',
    createdAt: 1714569600000
  },
  {
    id: 'houston-demo-id',
    name: 'Houston Medical Consumables Depot',
    city: 'Houston',
    address: '420 Biomedical Lane, Suite E',
    contactPhone: '+1 (713) 555-0192',
    createdAt: 1714569600000
  },
  {
    id: 'boston-demo-id',
    name: 'Boston Clinical Hardware Center',
    city: 'Boston',
    address: '109 Innovation Square, Biotech Row',
    contactPhone: '+1 (617) 555-0144',
    createdAt: 1714569600000
  }
];

const DEFAULT_PRODUCT_FALLBACKS: Product[] = [
  {
    id: 'p1',
    name: 'Sterile Curved Cutter Stapler 75mm',
    sku: 'SURG-CCS-75X',
    category: 'Sutures & Wound Closure',
    description: 'Titanium micro-clips with mechanical reinforcement, loaded with sterile surgical staples.',
    price: 24900,
    unit: 'Unit',
    stock: {
      'chicago-demo-id': 24,
      'houston-demo-id': 15,
      'boston-demo-id': 30
    },
    createdAt: 1714569600000
  },
  {
    id: 'p2',
    name: 'Anatomical Titanium Bone Plate',
    sku: 'ORTH-ITB-290',
    category: 'Orthopedic Implants',
    description: 'Locking radius bone plating with medical titanium, certified sterile for immediate orthopaedic insertion.',
    price: 43550,
    unit: 'Box of 5',
    stock: {
      'chicago-demo-id': 12,
      'houston-demo-id': 8,
      'boston-demo-id': 18
    },
    createdAt: 1714569600000
  },
  {
    id: 'p3',
    name: 'Cuffed Endotracheal Tube - Sterile Size 7.5',
    sku: 'ANES-ETT-75C',
    category: 'Anesthesia & Airway',
    description: 'Single-use respiratory intubation tube, PVC structure, equipped with safety low-pressure balloon cuff.',
    price: 8500,
    unit: 'Box of 20',
    stock: {
      'chicago-demo-id': 50,
      'houston-demo-id': 42,
      'boston-demo-id': 60
    },
    createdAt: 1714569600000
  },
  {
    id: 'p4',
    name: 'Reinforced Surgical Gown XL (SMS Fabric)',
    sku: 'PPE-RSG-XL9',
    category: 'PPE & Sterilization',
    description: 'Fluid-repelling certified Level 4 barrier surgical gowns, anti-static, knit cuffs, supreme safety.',
    price: 11999,
    unit: 'Box of 15',
    stock: {
      'chicago-demo-id': 110,
      'houston-demo-id': 80,
      'boston-demo-id': 140
    },
    createdAt: 1714569600000
  }
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDbSeeded, setIsDbSeeded] = useState<boolean | null>(null);

  // Firestore Sync State with high-fidelity realistic fallbacks
  const [branches, setBranches] = useState<Branch[]>(DEFAULT_BRANCH_FALLBACKS);
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCT_FALLBACKS);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [discounts, setDiscounts] = useState<BranchDiscount[]>([]);
  const [transfers, setTransfers] = useState<TransferDemand[]>([]);
  const [deletedProductIds, setDeletedProductIds] = useState<string[]>([]);
  const [deletedBranchIds, setDeletedBranchIds] = useState<string[]>([]);

  // UI Navigation Tabs
  const [activeTab, setActiveTab ] = useState<'products' | 'branches' | 'deliveries' | 'coordination' | 'analytics' | 'discounts' | 'transfers'>('products');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Compute merged discounts from both collection and branches fallback
  const mergedDiscounts = React.useMemo(() => {
    const map = new Map<string, BranchDiscount>();
    
    // Add branch-embedded ones first
    branches.forEach(b => {
      (b.discounts || []).forEach(d => {
        map.set(`${d.branchId}-${d.hospitalUid}-${d.productId}`, d);
      });
    });

    // Overwrite with root level database collection ones if they exist
    discounts.forEach(d => {
      map.set(`${d.branchId}-${d.hospitalUid}-${d.productId}`, d);
    });

    return Array.from(map.values());
  }, [discounts, branches]);

  // Manual Credentials Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // 1. Listen to Authentication State Changes with robust offline fallback triggers and real-time profile loading
  useEffect(() => {
    let unsubProfileSnapshot: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubProfileSnapshot) {
        unsubProfileSnapshot();
        unsubProfileSnapshot = null;
      }

      setCurrentUser(user);
      if (user) {
        // Fetch or create user profile document
        const userDocRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            // New user, write default profile with administrative checks
            const emailValue = user.email || '';
            const isDefaultSuper = emailValue === 'master.admin@medlogix.com' || emailValue === 'ronakb2020@gmail.com';
            const isDefaultBranch = emailValue === 'midwest.hub@medlogix.com';

            const newProfile: UserProfile = {
              uid: user.uid,
              email: emailValue,
              displayName: user.displayName || displayName || (isDefaultSuper ? 'Ronak B (Super Admin)' : isDefaultBranch ? 'Chicago Logistics Lead' : emailValue.split('@')[0]) || 'User',
              role: isDefaultSuper ? 'super_admin' : isDefaultBranch ? 'branch_admin' : 'hospital',
              branchId: isDefaultBranch ? 'chicago-demo-id' : null,
              hospitalName: (isDefaultSuper || isDefaultBranch) ? null : (hospitalName || null),
              createdAt: Date.now()
            };
            try {
              await setDoc(userDocRef, newProfile);
            } catch (writeErr) {
              console.warn("Could not write document to server (offline): ", writeErr);
            }
          }
        } catch (err) {
          console.warn("Error checking user existence: ", err);
        }

        // Setup real-time snapshot listener for this user
        unsubProfileSnapshot = onSnapshot(userDocRef, (snapshot) => {
          if (snapshot.exists()) {
            const profile = snapshot.data() as UserProfile;
            const emailValue = profile.email || '';
            const shouldBeSuper = emailValue === 'master.admin@medlogix.com' || emailValue === 'ronakb2020@gmail.com';
            if (shouldBeSuper && profile.role !== 'super_admin') {
              profile.role = 'super_admin';
            }
            setUserProfile(profile);
          } else {
            // Document deleted or missing from firestore
            const emailValue = user.email || '';
            const isDefaultSuper = emailValue === 'master.admin@medlogix.com' || emailValue === 'ronakb2020@gmail.com';
            setUserProfile({
              uid: user.uid,
              email: emailValue,
              displayName: user.displayName || displayName || 'User',
              role: isDefaultSuper ? 'super_admin' : 'hospital',
              branchId: null,
              createdAt: Date.now()
            });
          }
          setLoading(false);
        }, (err) => {
          console.warn("Profile snapshot error: ", err);
          setLoading(false);
        });

      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfileSnapshot) unsubProfileSnapshot();
    };
  }, [displayName, hospitalName]);

  // 2. Real-time Firestore Listeners (only when authenticated)
  useEffect(() => {
    if (!currentUser) {
      setBranches([]);
      setProducts([]);
      setDeliveries([]);
      setAllUsers([]);
      setIsDbSeeded(null);
      return;
    }

    let branchesEmpty = true;
    let productsEmpty = true;

    // Set up snapshot streams with error catching
    const unsubBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
      branchesEmpty = branchList.length === 0;
      setIsDbSeeded(!(branchesEmpty || productsEmpty));
      if (branchList.length > 0) {
        setBranches(branchList);
      } else {
        setBranches(DEFAULT_BRANCH_FALLBACKS);
      }
    }, (err) => {
      console.warn("Permission restricted for branches: ", err);
      setBranches(DEFAULT_BRANCH_FALLBACKS);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      productsEmpty = productList.length === 0;
      setIsDbSeeded(!(branchesEmpty || productsEmpty));
      if (productList.length > 0) {
        setProducts(productList);
      } else {
        setProducts(DEFAULT_PRODUCT_FALLBACKS);
      }
    }, (err) => {
      console.warn("Permission restricted for products: ", err);
      setProducts(DEFAULT_PRODUCT_FALLBACKS);
    });

    const unsubDeliveries = onSnapshot(collection(db, 'deliveries'), (snapshot) => {
      const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const deliveryList = allDocs.filter(d => !(d as any).isTransfer) as DeliveryOrder[];
      const transferList = allDocs.filter(d => (d as any).isTransfer) as any[] as TransferDemand[];
      
      setDeliveries(deliveryList);
      setTransfers(transferList);
    }, (err) => {
      console.warn("Permission restricted for deliveries: ", err);
    });

    const unsubDiscounts = onSnapshot(collection(db, 'discounts'), (snapshot) => {
      const discountList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BranchDiscount));
      setDiscounts(discountList);
    }, (err) => {
      console.warn("Permission restricted for discounts: ", err);
    });

    // Sync all users directory - only accessible to authorized admins, we'll gracefully ignore on permission error
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map(d => d.data() as UserProfile);
      setAllUsers(usersList);
    }, (err) => {
      console.log("Normal access limitation: Users list only syncing to Super Admins.");
    });

    return () => {
      unsubBranches();
      unsubProducts();
      unsubDeliveries();
      unsubUsers();
      unsubDiscounts();
    };
  }, [currentUser]);

  // Handle Manual Log-in & Account creation
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (isRegistering) {
        if (!displayName.trim()) {
          setAuthError('Identity display name is required.');
          setAuthLoading(false);
          return;
        }
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      // Reset details fields
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch (err: any) {
      let friendlyMessage = err.message;
      if (friendlyMessage.includes('auth/invalid-credential')) friendlyMessage = 'Invalid combination. Verify email or password entries.';
      if (friendlyMessage.includes('auth/weak-password')) friendlyMessage = 'Password must be at least 6 characters.';
      if (friendlyMessage.includes('auth/email-already-in-use')) friendlyMessage = 'Email address has already been registered.';
      setAuthError(friendlyMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // Automated Demo Lab Seeder (Triggers real email sign-in using actual fire-auth credentials)
  const handleDemoSignIn = async (roleType: 'super' | 'branch' | 'hospital' | 'ronakb2020') => {
    setAuthError('');
    setLoading(true);

    let demoEmail = '';
    let defaultDisName = '';
    let defaultHospName = '';
    let assignRole: UserRole = 'hospital';
    let demoPassword = 'Password123!';

    switch (roleType) {
      case 'ronakb2020':
        demoEmail = 'ronakb2020@gmail.com';
        defaultDisName = 'Ronak B (Super Admin)';
        assignRole = 'super_admin';
        demoPassword = '123456';
        break;
      case 'super':
        demoEmail = 'master.admin@medlogix.com';
        defaultDisName = 'Corporate QA Administrator';
        assignRole = 'super_admin';
        break;
      case 'branch':
        demoEmail = 'midwest.hub@medlogix.com';
        defaultDisName = 'Chicago Logistics Lead';
        assignRole = 'branch_admin';
        break;
      case 'hospital':
        demoEmail = 'stjude.surgical@medlogix.com';
        defaultDisName = 'St. Jude OR Coordinator';
        defaultHospName = 'St. Jude Surgical Center';
        assignRole = 'hospital';
        break;
    }

    try {
      // Attempt login
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      } catch (loginErr) {
        // If login failed (not registered yet), register on the fly inside real Auth
        setDisplayName(defaultDisName);
        setHospitalName(defaultHospName);
        userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
      }

      // Ensure profile is written or updated to guarantee designated role permissions!
      if (userCredential.user) {
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        
        // Chicago branch binding for Midwestern demo admin
        let boundBranchId = null;
        if (roleType === 'branch') {
          // If Chicago branch exists, bind them, otherwise we will assign on branch creation
          const chicagoBranch = branches.find(b => b.city.toLowerCase() === 'chicago');
          if (chicagoBranch) {
            boundBranchId = chicagoBranch.id;
          } else {
            boundBranchId = 'chicago-demo-id'; // Fallback seed binding
          }
        }

        const exactProfile: UserProfile = {
          uid: userCredential.user.uid,
          email: demoEmail,
          displayName: defaultDisName,
          role: assignRole,
          branchId: boundBranchId,
          hospitalName: defaultHospName || null,
          createdAt: Date.now()
        };

        await setDoc(userDocRef, exactProfile);
        setUserProfile(exactProfile);
      }
    } catch (err: any) {
      setAuthError(`Demoware failure: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Seeder to bootstrap database with realistic sample records
  const handleBootstrapDb = async () => {
    if (!userProfile || userProfile.role !== 'super_admin') {
      alert('Unauthorized: Must be corporate Super Administrator to initialize system data.');
      return;
    }
    setLoading(true);
    try {
      const batch = writeBatch(db);

      // 1. Seed branches
      const centralBranchRef = doc(collection(db, 'branches'), 'chicago-demo-id');
      const texasBranchRef = doc(collection(db, 'branches'));
      const northeastBranchRef = doc(collection(db, 'branches'));

      batch.set(centralBranchRef, {
        name: 'Chicago Central Logistics Center',
        city: 'Chicago',
        address: '840 Logistics Way, Grid Sector 14A',
        contactPhone: '+1 (312) 555-0104',
        createdAt: Date.now()
      });

      batch.set(texasBranchRef, {
        name: 'Houston Medical Consumables Depot',
        city: 'Houston',
        address: '420 Biomedical Lane, Suite E',
        contactPhone: '+1 (713) 555-0192',
        createdAt: Date.now()
      });

      batch.set(northeastBranchRef, {
        name: 'Boston Clinical Hardware Center',
        city: 'Boston',
        address: '109 Innovation Square, Biotech Row',
        contactPhone: '+1 (617) 555-0144',
        createdAt: Date.now()
      });

      // 2. Seed Medical Surgical Products with Stock Map
      const p1Ref = doc(collection(db, 'products'));
      const p2Ref = doc(collection(db, 'products'));
      const p3Ref = doc(collection(db, 'products'));
      const p4Ref = doc(collection(db, 'products'));

      batch.set(p1Ref, {
        name: 'Sterile Curved Cutter Stapler 75mm',
        sku: 'SURG-CCS-75X',
        category: 'Sutures & Wound Closure',
        description: 'Titanium micro-clips with mechanical reinforcement, loaded with sterile surgical staples suitable for laparoscopy.',
        price: 249.00,
        unit: 'Unit',
        stock: {
          'chicago-demo-id': 24,
          [texasBranchRef.id]: 15,
          [northeastBranchRef.id]: 30
        },
        createdAt: Date.now()
      });

      batch.set(p2Ref, {
        name: 'Anatomical Titanium Bone Plate (Distal Radius)',
        sku: 'ORTH-ITB-290',
        category: 'Orthopedic Implants',
        description: 'Locking radius bone plating with medical titanium, certified sterile for immediate orthopaedic insertion.',
        price: 435.50,
        unit: 'Box of 5',
        stock: {
          'chicago-demo-id': 12,
          [texasBranchRef.id]: 8,
          [northeastBranchRef.id]: 18
        },
        createdAt: Date.now()
      });

      batch.set(p3Ref, {
        name: 'Cuffed Endotracheal Tube - Sterile Size 7.5',
        sku: 'ANES-ETT-75C',
        category: 'Anesthesia & Airway',
        description: 'Single-use respiratory intubation tube, PVC structure, equipped with safety low-pressure balloon cuff.',
        price: 85.00,
        unit: 'Box of 20',
        stock: {
          'chicago-demo-id': 50,
          [texasBranchRef.id]: 42,
          [northeastBranchRef.id]: 60
        },
        createdAt: Date.now()
      });

      batch.set(p4Ref, {
        name: 'Reinforced Surgical Gown XL (SMS Fabric)',
        sku: 'PPE-RSG-XL9',
        category: 'PPE & Sterilization',
        description: 'Fluid-repelling certified Level 4 barrier surgical gowns, anti-static, knit cuffs, supreme safety.',
        price: 119.99,
        unit: 'Box of 15',
        stock: {
          'chicago-demo-id': 110,
          [texasBranchRef.id]: 80,
          [northeastBranchRef.id]: 140
        },
        createdAt: Date.now()
      });

      await batch.commit();
      alert('Successful Database Initialization! Standard regional branches and surgical supply items bootstrapped.');
    } catch (err) {
      console.error(err);
      alert('Failure during seed: check credentials configuration and rules match context.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    await signOut(auth);
    setLoading(false);
  };

  // Rendering Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-slate-500 text-sm font-bold tracking-wide mt-4">Initializing MediLogix Portal...</p>
      </div>
    );
  }

  // AUTHENTICATION SCREEN
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="mx-auto h-12 w-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
            <Truck className="w-6 h-6" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">
            MediLogix Hub
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Clinical Supply Logistics & Hospital Consignment Network
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
          <div className="bg-white py-8 px-4 border border-slate-100 shadow-xs sm:rounded-3xl sm:px-10 space-y-6">
            
            {/* Real Authentication Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">
                {isRegistering ? 'Register Clinic Account' : 'Credentials Authentication'}
              </h3>
              
              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs flex gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {isRegistering && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Your Full Name / Title</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">
                      <Users className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Dr. Arthur Pendelton"
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                    />
                  </div>
                </div>
              )}

              {isRegistering && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Hospital / Clinic Facility Name</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400">
                      <Hospital className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      placeholder="e.g. Chicago General Hospital"
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Clinic Email Address</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="clinic@healthcare.xyz"
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Secure Passkey</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setAuthError('');
                  }}
                  className="text-xs text-indigo-600 font-semibold hover:underline"
                >
                  {isRegistering ? 'Already have an account? Sign In' : 'Create new Hospital Account'}
                </button>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="bg-slate-900 text-white font-semibold hover:bg-slate-800 text-xs px-5 py-2.5 rounded-xl flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? 'Authorizing...' : isRegistering ? 'Register' : 'Sign In'} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            <div className="text-center pt-2">
              <p className="text-[11px] text-slate-400">
                To access administratively, logon using your registered Super Admin or Branch Admin credentials.
              </p>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // AUTHENTICATED PLATFORM MAIN DASHBOARD
  const isSuperAdmin = userProfile.role === 'super_admin';
  const isBranchAdmin = userProfile.role === 'branch_admin';
  const isHospital = userProfile.role === 'hospital';

  // Dynamic filtered lists to exclude locally deleted/decommissioned items
  const activeProducts = products.filter(p => !deletedProductIds.includes(p.id));
  const activeBranches = branches.filter(b => !deletedBranchIds.includes(b.id));

  // Find the operating city or division dynamically
  const userBranch = activeBranches.find(b => b.id === userProfile.branchId);
  const locationLabel = isHospital 
    ? (userProfile.hospitalName || 'Clinical Client') 
    : isBranchAdmin 
      ? `${userBranch?.city || 'Regional'} Hub` 
      : 'Corporate HQ (Central)';

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC] text-[#0F172A] selection:bg-blue-600/10 font-sans">
      
      {/* Mobile Drawer Overlay Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300" 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar for Mobile View (Slide-over drawer) */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[270px] bg-[#0F172A] text-[#F8FAFC] p-6 flex flex-col justify-between border-r border-[#1E293B] shadow-2xl md:hidden transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div>
          {/* Logo & Close Button inside Mobile Drawer */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#3B82F6] rounded-md flex items-center justify-center font-black text-white text-base">
                M
              </div>
              <div>
                <div className="font-bold text-base text-white tracking-tight leading-tight">Meru Medical</div>
                <div className="text-[9px] opacity-60 font-black tracking-widest uppercase text-[#3B82F6]">LOGISTICS PRO</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close Navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links inside Mobile Drawer */}
          <nav className="space-y-1">
            {isHospital ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-[#1E293B] text-[#3B82F6] rounded-lg font-medium text-sm">
                <Hospital className="w-4 h-4 text-[#3B82F6]" />
                <span className="text-sm font-semibold">Hospital Orders</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('products');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'products' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>Inventory Control</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('deliveries');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'deliveries' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                >
                  <Truck className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">Hospital Orders</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${activeTab === 'deliveries' ? 'bg-[#3B82F6] text-[#0F172A]' : 'bg-slate-800 text-slate-400'}`}>
                    {deliveries.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('branches');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'branches' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>Branch Network</span>
                </button>

                {(isSuperAdmin || isBranchAdmin) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('discounts');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'discounts' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  >
                    <Tag className="w-4 h-4 shrink-0" />
                    <span>Branch Discounts</span>
                  </button>
                )}

                {(isSuperAdmin || isBranchAdmin) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('transfers');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'transfers' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  >
                    <ArrowRightLeft className="w-4 h-4 shrink-0" />
                    <span>Branch Transfers</span>
                  </button>
                )}

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('coordination');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'coordination' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span>Staff Directory</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('analytics');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'analytics' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                >
                  <BarChart2 className="w-4 h-4 shrink-0" />
                  <span>Business Analytics</span>
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Identity & LogOut inside Mobile Drawer */}
        <div className="mt-8 pt-6 border-t border-[#1E293B] space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-[#3B82F6] border border-slate-700 flex items-center justify-center font-bold text-xs shrink-0 select-none">
              {userProfile.displayName ? userProfile.displayName.substring(0, 2).toUpperCase() : 'ME'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-[#64748B] font-mono font-bold uppercase tracking-wider">Firebase Connected</div>
              <div className="text-sm font-semibold truncate text-white leading-tight mt-0.5">{userProfile.displayName}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              handleLogout();
              setMobileMenuOpen(false);
            }}
            className="w-full py-2.5 bg-slate-800/65 text-slate-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-rose-955/25 hover:text-rose-400 border border-slate-700/60 transition-all cursor-pointer"
            title="Sign Out of Terminal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 1. Left Navigation Sidebar (Desktop version, collapsible) */}
      <aside 
        className={`hidden md:flex flex-col justify-between shrink-0 bg-[#0F172A] text-[#F8FAFC] border-r border-[#1E293B] transition-all duration-300 ease-in-out md:sticky md:top-0 md:h-screen ${
          sidebarCollapsed ? 'w-[76px] p-3' : 'w-[260px] p-6'
        }`}
      >
        <div>
          {/* Logo element with Collapse/Expand Action Button */}
          <div className={`mb-10 flex items-center justify-between ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 bg-[#3B82F6] rounded-md flex items-center justify-center font-black text-white text-base shrink-0 select-none">
                M
              </div>
              {!sidebarCollapsed && (
                <div className="transition-all duration-300 whitespace-nowrap animate-fade-in">
                  <div className="font-bold text-base text-white tracking-tight leading-tight">Meru Medical</div>
                  <div className="text-[9px] opacity-60 font-black tracking-widest uppercase text-[#3B82F6]">LOGISTICS PRO</div>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Collapse Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Unfold Arrow trigger visible ONLY when collapsed */}
          {sidebarCollapsed && (
            <div className="flex justify-center mb-8">
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white hover:bg-[#3B82F6] transition shadow-md cursor-pointer"
                title="Expand Sidebar"
              >
                <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>
          )}

          {/* Dynamic page routes mapped to the side menu */}
          <nav className="space-y-1.5">
            {isHospital ? (
              <div 
                className={`flex items-center bg-[#1E293B] text-[#3B82F6] rounded-lg font-medium text-sm ${sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}`}
                title="Hospital Orders"
              >
                <Hospital className="w-4 h-4 text-[#3B82F6] shrink-0" />
                {!sidebarCollapsed && <span className="text-sm font-semibold">Hospital Orders</span>}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('products')}
                  className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                  } ${activeTab === 'products' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  title="Inventory Control"
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="whitespace-nowrap transition-opacity">Inventory Control</span>}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('deliveries')}
                  className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all cursor-pointer relative ${
                    sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                  } ${activeTab === 'deliveries' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  title="Hospital Orders"
                >
                  <Truck className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed ? (
                    <>
                      <span className="flex-1 text-left whitespace-nowrap">Hospital Orders</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${activeTab === 'deliveries' ? 'bg-[#3B82F6] text-[#0F172A]' : 'bg-slate-800 text-slate-400'}`}>
                        {deliveries.length}
                      </span>
                    </>
                  ) : (
                    deliveries.length > 0 && (
                      <span className="absolute top-1 right-1 bg-[#3B82F6] text-[#0F172A] text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-[#0F172A]">
                        {deliveries.length}
                      </span>
                    )
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('branches')}
                  className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                  } ${activeTab === 'branches' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  title="Branch Network"
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="whitespace-nowrap">Branch Network</span>}
                </button>

                {(isSuperAdmin || isBranchAdmin) && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('discounts')}
                    className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                    } ${activeTab === 'discounts' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                    title="Branch Discounts"
                  >
                    <Tag className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span className="whitespace-nowrap">Branch Discounts</span>}
                  </button>
                )}

                {(isSuperAdmin || isBranchAdmin) && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('transfers')}
                    className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                    } ${activeTab === 'transfers' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                    title="Branch Transfers"
                  >
                    <ArrowRightLeft className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span className="whitespace-nowrap">Branch Transfers</span>}
                  </button>
                )}

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('coordination')}
                    className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                    } ${activeTab === 'coordination' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                    title="Staff Directory"
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span className="whitespace-nowrap">Staff Directory</span>}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className={`w-full flex items-center rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    sidebarCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'
                  } ${activeTab === 'analytics' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  title="Business Analytics"
                >
                  <BarChart2 className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="whitespace-nowrap">Business Analytics</span>}
                </button>
              </>
            )}
          </nav>
        </div>

        {/* User Identity and Connection state at the bottom */}
        <div className={`mt-8 pt-6 border-t border-[#1E293B] flex ${sidebarCollapsed ? 'flex-col items-center gap-4' : 'flex-col gap-4'}`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="w-8 h-8 rounded-full bg-slate-800 text-[#3B82F6] border border-slate-700 flex items-center justify-center font-bold text-xs shrink-0 select-none">
              {userProfile.displayName ? userProfile.displayName.substring(0, 2).toUpperCase() : 'ME'}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1 animate-fade-in font-sans">
                <div className="text-[10px] text-[#64748B] font-mono font-bold uppercase tracking-wider">Firebase Connected</div>
                <div className="text-sm font-semibold truncate text-white leading-tight mt-0.5">{userProfile.displayName}</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className={`flex items-center justify-center border border-slate-700/60 rounded-lg hover:bg-rose-950/20 hover:text-rose-400 transition-all cursor-pointer ${
              sidebarCollapsed ? 'p-2.5 w-10 h-10 bg-slate-800/65 text-slate-300' : 'w-full py-2.5 bg-slate-800/65 text-slate-300 text-xs font-semibold gap-2'
            }`}
            title="Sign Out of Terminal"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* 2. Main Content Right Panel */}
      <div className="flex-grow flex flex-col min-h-screen min-w-0">
        
        {/* Header Bar Area */}
        <header className="h-20 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 sm:px-8 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Action Button toggles sidebar on small viewports */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5.5 h-5.5" />
            </button>

            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight">
                {isHospital 
                  ? 'Central Procurement Hub' 
                  : activeTab === 'products'
                    ? 'Central Inventory Control'
                    : activeTab === 'deliveries'
                      ? 'Hospital Consignment Logs'
                      : activeTab === 'branches'
                        ? 'Physical Branch Network'
                        : activeTab === 'analytics'
                          ? 'Operational Intelligence Dashboard'
                          : 'Operational Staff Directory'}
              </h1>
              <p className="text-xs text-slate-500 mt-1 hidden sm:block">
                {isHospital 
                  ? 'Review product catalogue supplies and request rapid consignment logistics.' 
                  : activeTab === 'analytics'
                    ? 'Check overall and regional delivery sales, partner discounts, and supply stats.'
                    : 'Configure stocks, track deliveries, and manage branches.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center bg-[#F1F5F9] px-3.5 py-1.5 rounded-full border border-[#E2E8F0] gap-2">
              <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse"></div>
              <span className="text-[11px] sm:text-xs font-bold text-[#475569]">{locationLabel}</span>
            </div>

            <div className="w-9 h-9 bg-[#E2E8F0] border border-slate-300 rounded-full flex items-center justify-center font-bold text-slate-600 text-xs invisible sm:visible">
              {userProfile.displayName ? userProfile.displayName.substring(0, 2).toUpperCase() : 'AS'}
            </div>
          </div>
        </header>

        {/* Corporate setup notification header */}
        {isDbSeeded === false && (
          <div className="bg-[#0F172A] text-[#F8FAFC] py-3 px-8 border-b border-[#1E293B] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0 font-sans">
            <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <ShieldCheck className="w-4 h-4 text-[#3B82F6]" /> 
              {isSuperAdmin 
                ? "Platform setup warning: Cloud Firestore database collections are empty. Initialize now." 
                : "Database warning: Firestore database collections are unpopulated. Falling back to default lists."}
            </span>
            {isSuperAdmin ? (
              <button
                onClick={handleBootstrapDb}
                type="button"
                className="bg-[#3B82F6] text-white hover:bg-[#2563EB] font-bold px-4 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-all cursor-pointer shrink-0"
              >
                Seed Standard Hospital Logistics
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 font-mono">
                Please contact Super Admin (ronakb2020@gmail.com) to seed live database
              </span>
            )}
          </div>
        )}

        {/* Render Active View Tab */}
        <main className="p-6 sm:p-8 flex-grow">
          {isHospital ? (
            <HospitalClientView 
              currentUserProfile={userProfile}
              products={activeProducts}
              branches={activeBranches}
              discounts={mergedDiscounts}
              deliveries={deliveries}
            />
          ) : (
            <>
              {activeTab === 'products' && (
                <ProductsTab 
                  currentUserProfile={userProfile}
                  products={activeProducts}
                  branches={activeBranches}
                  onMarkDeleted={(id) => setDeletedProductIds(prev => [...prev, id])}
                />
              )}

              {activeTab === 'branches' && (
                <BranchesTab 
                  currentUserProfile={userProfile}
                  branches={activeBranches}
                  setBranches={setBranches}
                  onMarkDeleted={(id) => setDeletedBranchIds(prev => [...prev, id])}
                />
              )}

              {activeTab === 'deliveries' && (
                <DeliveriesTab 
                  currentUserProfile={userProfile}
                  deliveries={deliveries}
                  branches={activeBranches}
                  products={activeProducts}
                />
              )}

              {activeTab === 'discounts' && (isSuperAdmin || isBranchAdmin) && (
                <DiscountsTab 
                  currentUserProfile={userProfile}
                  branches={activeBranches}
                  products={activeProducts}
                  users={allUsers}
                  discounts={mergedDiscounts}
                />
              )}

              {activeTab === 'coordination' && isSuperAdmin && (
                <UserManagementTab 
                  currentUserProfile={userProfile}
                  usersList={allUsers}
                  branches={activeBranches}
                />
              )}

              {activeTab === 'analytics' && (
                <AnalyticsTab 
                  currentUserProfile={userProfile}
                  deliveries={deliveries}
                  branches={activeBranches}
                  products={activeProducts}
                />
              )}

              {activeTab === 'transfers' && (isSuperAdmin || isBranchAdmin) && (
                <TransfersTab 
                  currentUserProfile={userProfile}
                  branches={activeBranches}
                  products={activeProducts}
                  transfers={transfers}
                />
              )}
            </>
          )}
        </main>

        <footer className="bg-white border-t border-[#E2E8F0] py-6 text-center text-xs text-[#64748B] mt-auto shrink-0 font-sans">
          <p>© 2026 Meru Medical | Logistics Pro System</p>
          <p className="mt-1 text-[10px] text-slate-400">Firebase Synchronization enabled with automatic role validation.</p>
        </footer>
      </div>

    </div>
  );
}
