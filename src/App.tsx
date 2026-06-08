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
import { UserProfile, Branch, Product, DeliveryOrder, UserRole } from './types';
import BranchesTab from './components/BranchesTab';
import ProductsTab from './components/ProductsTab';
import DeliveriesTab from './components/DeliveriesTab';
import HospitalClientView from './components/HospitalClientView';
import UserManagementTab from './components/UserManagementTab';

import { 
  Truck, Building2, ShoppingBag, ShieldCheck, 
  Users, LogOut, Loader2, Hospital, Key, Lock, 
  Mail, ClipboardCheck, ArrowRight, CheckCircle2, ShieldAlert
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Firestore Sync State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // UI Navigation Tabs
  const [activeTab, setActiveTab] = useState<'products' | 'branches' | 'deliveries' | 'coordination'>('products');

  // Manual Credentials Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // 1. Listen to Authentication State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch or create user profile document
        const userDocRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else {
            // New user, write default profile
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || displayName || user.email?.split('@')[0] || 'User',
              role: 'hospital', // Defaults to hospital client
              branchId: null,
              hospitalName: hospitalName || null,
              createdAt: Date.now()
            };
            await setDoc(userDocRef, newProfile);
            setUserProfile(newProfile);
          }
        } catch (err) {
          console.error("Error loading user details: ", err);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [displayName, hospitalName]);

  // 2. Real-time Firestore Listeners (only when authenticated)
  useEffect(() => {
    if (!currentUser) {
      setBranches([]);
      setProducts([]);
      setDeliveries([]);
      setAllUsers([]);
      return;
    }

    // Set up snapshot streams with error catching
    const unsubBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const branchList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Branch));
      setBranches(branchList);
    }, (err) => {
      console.warn("Permission restricted for branches: ", err);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(productList);
    }, (err) => {
      console.warn("Permission restricted for products: ", err);
    });

    const unsubDeliveries = onSnapshot(collection(db, 'deliveries'), (snapshot) => {
      const deliveryList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOrder));
      setDeliveries(deliveryList);
    }, (err) => {
      console.warn("Permission restricted for deliveries: ", err);
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
  const handleDemoSignIn = async (roleType: 'super' | 'branch' | 'hospital') => {
    setAuthError('');
    setLoading(true);

    let demoEmail = '';
    let defaultDisName = '';
    let defaultHospName = '';
    let assignRole: UserRole = 'hospital';

    switch (roleType) {
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

    const demoPassword = 'Password123!';
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

            {/* Quick Demo Sandbox Access */}
            <div className="border-t border-slate-100 pt-5 space-y-3 bg-slate-50/50 -mx-4 -mb-8 p-6 rounded-b-3xl sm:-mx-10 sm:px-10">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4 text-slate-600" /> Instant Demoware Sandbox Portal
                </h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Connect instantly to seed accounts. Tests with actual Firebase database configuration.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleDemoSignIn('super')}
                  className="bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50/10 text-slate-700 text-xs text-left p-3 rounded-xl transition-all group shrink-0 font-sans cursor-pointer"
                >
                  <p className="font-extrabold text-violet-750 flex items-center gap-1.5 ">
                    <Key className="w-3 h-3" /> Super Admin
                  </p>
                  <p className="text-[9px] text-slate-455 mt-1">Manage all Catalog items, regional branches & user clearances.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSignIn('branch')}
                  className="bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/10 text-slate-700 text-xs text-left p-3 rounded-xl transition-all group shrink-0 font-sans cursor-pointer"
                >
                  <p className="font-extrabold text-blue-700 flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" /> Branch Admin
                  </p>
                  <p className="text-[9px] text-slate-455 mt-1">Adjust local Chicago stock. Fullfil and ship chicago hospital orders.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoSignIn('hospital')}
                  className="bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/10 text-slate-700 text-xs text-left p-3 rounded-xl transition-all group shrink-0 font-sans cursor-pointer"
                >
                  <p className="font-extrabold text-emerald-700 flex items-center gap-1.5">
                    <Hospital className="w-3 h-3" /> Hospital User
                  </p>
                  <p className="text-[9px] text-slate-455 mt-1">Register medical consignment requests to delivery at St. Jude Clinic.</p>
                </button>
              </div>
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

  // Find the operating city or division dynamically
  const userBranch = branches.find(b => b.id === userProfile.branchId);
  const locationLabel = isHospital 
    ? (userProfile.hospitalName || 'Clinical Client') 
    : isBranchAdmin 
      ? `${userBranch?.city || 'Regional'} Hub` 
      : 'Corporate HQ (Central)';

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC] text-[#0F172A] selection:bg-blue-600/10 font-sans">
      
      {/* 1. Left Navigation Sidebar */}
      <aside className="w-full md:w-[260px] md:sticky md:top-0 md:h-screen shrink-0 bg-[#0F172A] text-[#F8FAFC] p-6 flex flex-col justify-between border-r border-[#1E293B]">
        <div>
          {/* Logo element matching template */}
          <div className="mb-10 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#3B82F6] rounded-md flex items-center justify-center font-black text-white text-base">
              M
            </div>
            <div>
              <div className="font-bold text-base text-white tracking-tight leading-tight">Meru Medical</div>
              <div className="text-[9px] opacity-60 font-black tracking-widest uppercase text-[#3B82F6]">LOGISTICS PRO</div>
            </div>
          </div>

          {/* Dynamic page routes mapped to the side menu */}
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
                  onClick={() => setActiveTab('products')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'products' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>Inventory Control</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('deliveries')}
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
                  onClick={() => setActiveTab('branches')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'branches' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>Branch Network</span>
                </button>

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('coordination')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${activeTab === 'coordination' ? 'bg-[#1E293B] text-[#3B82F6]' : 'text-[#64748B] hover:bg-white/5 hover:text-white'}`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span>Staff Directory</span>
                  </button>
                )}
              </>
            )}
          </nav>
        </div>

        {/* User Identity and Connection state at the bottom */}
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
            onClick={handleLogout}
            className="w-full py-2.5 bg-slate-800/65 text-slate-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-rose-955/25 hover:text-rose-400 border border-slate-700/60 transition-all cursor-pointer"
            title="Sign Out of Terminal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Right Panel */}
      <div className="flex-1 flex flex-col min-h-screen">
        
        {/* Header Bar Area */}
        <header className="h-20 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 sm:px-8 shrink-0">
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
                      : 'Operational Staff Directory'}
            </h1>
            <p className="text-xs text-slate-500 mt-1 hidden sm:block">
              {isHospital 
                ? 'Review product catalogue supplies and request rapid consignment logistics.' 
                : 'Configure stocks, track deliveries, and manage branches.'}
            </p>
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
        {isSuperAdmin && (branches.length === 0 || products.length === 0) && (
          <div className="bg-[#0F172A] text-[#F8FAFC] py-3 px-8 border-b border-[#1E293B] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0 font-sans">
            <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
              <ShieldCheck className="w-4 h-4 text-[#3B82F6]" /> Platform setup warning: Database indexes or values not loaded.
            </span>
            <button
              onClick={handleBootstrapDb}
              type="button"
              className="bg-[#3B82F6] text-white hover:bg-[#2563EB] font-bold px-4 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-all cursor-pointer shrink-0"
            >
              Seed Standard Hospital Logistics
            </button>
          </div>
        )}

        {/* Render Active View Tab */}
        <main className="p-6 sm:p-8 flex-grow">
          {isHospital ? (
            <HospitalClientView 
              currentUserProfile={userProfile}
              products={products}
              branches={branches}
            />
          ) : (
            <>
              {activeTab === 'products' && (
                <ProductsTab 
                  currentUserProfile={userProfile}
                  products={products}
                  branches={branches}
                />
              )}

              {activeTab === 'branches' && (
                <BranchesTab 
                  currentUserProfile={userProfile}
                  branches={branches}
                  setBranches={setBranches}
                />
              )}

              {activeTab === 'deliveries' && (
                <DeliveriesTab 
                  currentUserProfile={userProfile}
                  deliveries={deliveries}
                  branches={branches}
                  products={products}
                />
              )}

              {activeTab === 'coordination' && isSuperAdmin && (
                <UserManagementTab 
                  currentUserProfile={userProfile}
                  usersList={allUsers}
                  branches={branches}
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
