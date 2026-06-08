import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Branch, UserProfile } from '../types';
import { 
  ShoppingBag, Search, Plus, Minus, ShoppingCart, 
  MapPin, Phone, Building2, Calendar, FileText, Check, Landmark,
  User, Save, AlertTriangle, ShieldCheck
} from 'lucide-react';

interface HospitalClientViewProps {
  currentUserProfile: UserProfile | null;
  products: Product[];
  branches: Branch[];
}

interface CartItem {
  product: Product;
  quantity: number;
}

export default function HospitalClientView({ currentUserProfile, products, branches }: HospitalClientViewProps) {
  // Navigation Sub Tab
  const [activeSubTab, setActiveSubTab] = useState<'order' | 'profile'>('order');

  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // Delivery destination states
  const [hospitalName, setHospitalName] = useState(currentUserProfile?.hospitalName || '');
  const [address, setAddress] = useState(currentUserProfile?.hospitalAddress || '');
  const [contactPhone, setContactPhone] = useState(currentUserProfile?.hospitalPhone || '');
  const [notes, setNotes] = useState('');

  // Profile fields editing states
  const [profileHospitalName, setProfileHospitalName] = useState(currentUserProfile?.hospitalName || '');
  const [profileCity, setProfileCity] = useState(currentUserProfile?.hospitalCity || '');
  const [profileAddress, setProfileAddress] = useState(currentUserProfile?.hospitalAddress || '');
  const [profileCoordinator, setProfileCoordinator] = useState(currentUserProfile?.coordinatorName || currentUserProfile?.displayName || '');
  const [profilePhone, setProfilePhone] = useState(currentUserProfile?.hospitalPhone || '');

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSavedSuccess, setProfileSavedSuccess] = useState('');

  const [orderComplete, setOrderComplete] = useState(false);
  const [lastOrderId, setLastOrderId] = useState('');

  // 1. FILTER HUBS BY MATCHING CITY AS REQUESTED:
  // "in hospital dashboard - can only show particular city branch that match same city"
  const hospitalCityValue = currentUserProfile?.hospitalCity?.trim() || '';
  const hasMatchedCity = hospitalCityValue !== '';

  const matchedCityBranches = hasMatchedCity
    ? branches.filter(b => b.city.toLowerCase() === hospitalCityValue.toLowerCase())
    : [];

  // Show only designated branch that matches same city of hospital, falls back to all if none match or city not configured
  const displayBranches = hasMatchedCity && matchedCityBranches.length > 0
    ? matchedCityBranches
    : branches;

  const selectedBranch = branches.find(b => b.id === selectedBranchId);

  // Synchronize input fields of Order Form and Editing States with loaded Profile in real-time
  useEffect(() => {
    if (currentUserProfile) {
      setProfileHospitalName(currentUserProfile.hospitalName || '');
      setProfileCity(currentUserProfile.hospitalCity || '');
      setProfileAddress(currentUserProfile.hospitalAddress || '');
      setProfileCoordinator(currentUserProfile.coordinatorName || currentUserProfile.displayName || '');
      setProfilePhone(currentUserProfile.hospitalPhone || '');
      
      // Auto-prepopulate order checkout coordinates
      if (currentUserProfile.hospitalName) setHospitalName(currentUserProfile.hospitalName);
      if (currentUserProfile.hospitalAddress) setAddress(currentUserProfile.hospitalAddress);
      if (currentUserProfile.hospitalPhone) setContactPhone(currentUserProfile.hospitalPhone);
    }
  }, [currentUserProfile]);

  // Pre-select the matched branch automatically
  useEffect(() => {
    if (displayBranches.length > 0) {
      // If current selection is not part of displayBranches, reset to the first displayBranch
      const isStillAvailable = displayBranches.some(b => b.id === selectedBranchId);
      if (!selectedBranchId || !isStillAvailable) {
        setSelectedBranchId(displayBranches[0].id);
      }
    }
  }, [displayBranches, selectedBranchId]);

  // Handle Profile Update Operation
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile) return;

    if (!profileHospitalName.trim()) {
      alert('Hospital Facility Name is required.');
      return;
    }
    if (!profileCity.trim()) {
      alert('Operating City is required.');
      return;
    }
    if (!profileAddress.trim()) {
      alert('Delivery Street Address is required.');
      return;
    }
    if (!profileCoordinator.trim()) {
      alert('Coordinator Person Name is required.');
      return;
    }
    if (!profilePhone.trim()) {
      alert('Coordinator Phone Number is required.');
      return;
    }

    setIsSavingProfile(true);
    setProfileSavedSuccess('');
    const path = `users/${currentUserProfile.uid}`;

    try {
      await updateDoc(doc(db, 'users', currentUserProfile.uid), {
        hospitalName: profileHospitalName.trim(),
        hospitalCity: profileCity.trim(),
        hospitalAddress: profileAddress.trim(),
        coordinatorName: profileCoordinator.trim(),
        hospitalPhone: profilePhone.trim(),
        displayName: profileCoordinator.trim() // Keep display name synchronised with coordinator name
      });

      setProfileSavedSuccess('Success! Hospital Facility Profile details updated securely.');
      setTimeout(() => {
        setProfileSavedSuccess('');
        setActiveSubTab('order'); // Flip back to order panel automatically
      }, 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Cart Management
  const addToCart = (product: Product, availableStock: number) => {
    if (!selectedBranchId) {
      alert('Please select your Regional Fulfillment Hub first.');
      return;
    }
    
    if (availableStock <= 0) {
      alert('This item is currently out of stock at your selected hub.');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= availableStock) {
          alert(`Maximum available stock (${availableStock} ${product.unit}s) reached.`);
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, val: number, availableStock: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = Math.max(1, item.quantity + val);
        if (newQty > availableStock) {
          alert(`Maximum available stock (${availableStock} ${item.product.unit}s) reached.`);
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const getTotalPrice = () => {
    return cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
  };

  // CATEGORIES extracted
  const categories = Array.from(new Set(products.map(p => p.category)));

  // Filtered products for specific branch & search
  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Order Submission
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) {
      alert('Select your region hub branch.');
      return;
    }
    if (cart.length === 0) {
      alert('Your operational supply order contains no items.');
      return;
    }
    if (!hospitalName.trim() || !address.trim() || !contactPhone.trim()) {
      alert('Please fill out the destination Hospital details.');
      return;
    }

    const path = 'deliveries';
    try {
      const deliveryItems = cart.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        price: item.product.price
      }));

      const discountRate = currentUserProfile?.discountRate || 0;
      const subtotal = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
      const discountAmount = Math.round((subtotal * discountRate) / 100);
      const finalTotal = subtotal - discountAmount;

      // Create doc in deliveries
      const docRef = await addDoc(collection(db, 'deliveries'), {
        hospitalUid: currentUserProfile?.uid || 'anonymous_hospital',
        hospitalName: hospitalName.trim(),
        city: selectedBranch?.city || '',
        address: address.trim(),
        contactPhone: contactPhone.trim(),
        items: deliveryItems,
        branchId: selectedBranchId,
        status: 'pending',
        notes: notes.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        discountPercent: discountRate,
        discountAmount: discountAmount,
        finalTotal: finalTotal
      });

      // Atomically decrement stock in database (using individual updates as standard transaction)
      const batch = writeBatch(db);
      for (const item of cart) {
        const productRef = doc(db, 'products', item.product.id);
        const currentStock = item.product.stock || {};
        const newBranchStock = Math.max(0, (currentStock[selectedBranchId] || 0) - item.quantity);
        
        batch.update(productRef, {
          [`stock.${selectedBranchId}`]: newBranchStock
        });
      }
      await batch.commit();

      // Reset
      setCart([]);
      setLastOrderId(docRef.id);
      setOrderComplete(true);
      setNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  if (orderComplete) {
    return (
      <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-lg mx-auto text-center space-y-6 shadow-xs animate-fadeIn mt-10">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600">
          <Check className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800">Supply Consignment Registered</h3>
          <p className="text-slate-500 text-sm mt-1">
            Your delivery request has been registered and scheduled for fulfillment.
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100 space-y-2">
          <p className="text-xs text-slate-500 font-mono">Consignment No: <span className="text-slate-800 font-bold">{lastOrderId.toUpperCase()}</span></p>
          <p className="text-xs text-slate-500">Destination Clinic: <span className="text-slate-800 font-semibold">{hospitalName}</span></p>
          <p className="text-xs text-slate-500">Fulfillment Hub: <span className="text-slate-800 font-semibold">{selectedBranch?.name} ({selectedBranch?.city})</span></p>
        </div>

        <button
          onClick={() => setOrderComplete(false)}
          className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          Request Another Consignment
        </button>
      </div>
    );
  }

  // PROFILE Sub-view tab
  if (activeSubTab === 'profile') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
        {/* Toggle navigation panel in profile subtab */}
        <div className="flex justify-start gap-2 border-b border-slate-200 pb-4">
          <button
            type="button"
            onClick={() => setActiveSubTab('order')}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
          >
            📦 Back to Order Desk
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('profile')}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-indigo-600 text-white transition-all cursor-pointer"
          >
            🏥 Manage Facility Profile
          </button>
        </div>

        <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-xs space-y-6">
          <div>
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-500" /> Hospital Facility & Coordinator Settings
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Configure your operational location and clinical contact details. Filling this correctly enables automatic logistics routing to your city's hubs and streamlines consignment requests.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-5">
            {profileSavedSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-medium animate-fadeIn flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{profileSavedSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Facility Name */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="field-hospital-name">Hospital / Clinic Facility Name</label>
                <input
                  type="text"
                  required
                  id="field-hospital-name"
                  value={profileHospitalName}
                  onChange={(e) => setProfileHospitalName(e.target.value)}
                  placeholder="e.g. St. Jude Surgical Center"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="field-city">Operating City</label>
                <input
                  type="text"
                  required
                  id="field-city"
                  value={profileCity}
                  onChange={(e) => setProfileCity(e.target.value)}
                  placeholder="e.g. Chicago"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Your procurement dashboard will filter fulfillment hubs to match this city.</span>
              </div>

              {/* Coordinator Phone number */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="field-phone">Coordinator Contact Phone</label>
                <input
                  type="text"
                  required
                  id="field-phone"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="e.g. +1 (312) 555-0199"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                />
              </div>

              {/* Coordinator Person Name */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="field-coordinator-name">Point of Contact / Coordinator Person Name</label>
                <input
                  type="text"
                  required
                  id="field-coordinator-name"
                  value={profileCoordinator}
                  onChange={(e) => setProfileCoordinator(e.target.value)}
                  placeholder="e.g. Dr. Arthur Pendelton"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm"
                />
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="field-address">Delivery & Operations Street Address</label>
                <textarea
                  required
                  id="field-address"
                  value={profileAddress}
                  onChange={(e) => setProfileAddress(e.target.value)}
                  placeholder="e.g. 840 Healthcare Way, Suite 302, Sector 14A"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm h-24 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveSubTab('order')}
                className="px-6 py-2.5 border border-slate-200 font-bold hover:bg-slate-50 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {isSavingProfile ? 'Saving...' : 'Save Profile Details'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div id="hospital-dashboard-parent" className="space-y-6">
      
      {/* Sub-Tab Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3 gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('order')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'order'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'
            }`}
          >
            📦 Procurement Order Desk
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('profile')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-55'
            }`}
          >
            <User className="w-3.5 h-3.5" /> 🏥 Hospital Facility Profile
          </button>
        </div>

        {/* Dynamic status badge details */}
        <div>
          {hasMatchedCity ? (
            <div className="inline-flex items-center text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Matching City Hubs: {hospitalCityValue}</span>
            </div>
          ) : (
            <button
              onClick={() => setActiveSubTab('profile')}
              className="inline-flex items-center text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-100 px-3 py-1 rounded-full gap-1 hover:bg-amber-100/60 transition-colors"
            >
              <AlertTriangle className="w-3 h-3 text-amber-605 animate-pulse" />
              <span>Setup profile city to filter hubs</span>
            </button>
          )}
        </div>
      </div>

      {/* Warning banner if profile details are incomplete */}
      {(!currentUserProfile?.hospitalCity || !currentUserProfile?.hospitalAddress || !currentUserProfile?.coordinatorName || !currentUserProfile?.hospitalPhone) && (
        <div className="bg-amber-50 border border-amber-250 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fadeIn text-amber-900 shadow-2xs">
          <div className="flex gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-extrabold pb-0.5">Clinical Profile Incomplete</p>
              <p className="text-amber-705">Please update your Hospital Profile (City, Address, Coordinator Name, Phone Number). This satisfies hospital guidelines and matches hubs in your exact city.</p>
            </div>
          </div>
          <button
            onClick={() => setActiveSubTab('profile')}
            className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 hover:text-indigo-800 hover:underline shrink-0 pl-7 sm:pl-0"
          >
            Configure Profile Now
          </button>
        </div>
      )}

      <div id="hospital-view" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Catalog & selection */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Hub Selector */}
          <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800">
                <Building2 className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-bold">1. Select Your Nearest Regional Supply Hub</h3>
              </div>
              
              {hasMatchedCity && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded">
                  City Target: {hospitalCityValue}
                </span>
              )}
            </div>

            {/* City Match Feedback Message */}
            {hasMatchedCity ? (
              matchedCityBranches.length > 0 ? (
                <div className="text-emerald-700 bg-emerald-50/50 border border-emerald-100/60 px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 font-sans">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>📍 Displaying logistics hubs located directly in <strong>{hospitalCityValue}</strong>. Highly recommended for lowest transit latency.</span>
                </div>
              ) : (
                <div className="text-amber-700 bg-amber-50/50 border border-amber-100/60 px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 font-sans">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span>⚠️ No logistics hubs are registered directly in <strong>{hospitalCityValue}</strong>. Showing all network hubs to guarantee your procurement supply.</span>
                </div>
              )
            ) : (
              <div className="text-slate-600 bg-slate-50 border border-slate-100 px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 font-sans">
                <span className="inline-block w-2 h-2 rounded-full bg-slate-400"></span>
                <span>📌 Setup your operating city in the <strong>Hospital Facility Profile</strong> tab to filter and show ONLY matching city hub branches.</span>
              </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {displayBranches.map(branch => (
                <button
                  key={branch.id}
                  onClick={() => {
                    setSelectedBranchId(branch.id);
                    setCart([]); // Clear cart when switching branch to ensure correct stocks
                  }}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all ${selectedBranchId === branch.id ? 'border-slate-800 bg-slate-50 ring-2 ring-slate-850/5' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-sm">
                      {branch.city}
                    </span>
                    <h4 className="text-sm font-bold text-slate-800 leading-tight mt-1.5 truncate">{branch.name}</h4>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 truncate">{branch.address}</p>
                </button>
              ))}

              {displayBranches.length === 0 && (
                <div className="col-span-full py-6 text-center text-slate-400 text-sm italic">
                  Our logistics network is currently establishing branches. Try switching roles to Super Admin to construct a branch!
                </div>
              )}
            </div>
          </div>

          {/* Catalog Items */}
          <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2 text-slate-800">
              <ShoppingBag className="w-5 h-5 text-emerald-500" />
              <h3 className="text-base font-bold">2. Choose Medical Supplies</h3>
            </div>

            {/* Quick Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search surgical products..."
                className="w-full pl-9 pr-4 py-2 border border-slate-150 rounded-xl text-xs focus:outline-hidden text-slate-700"
              />
            </div>
          </div>

          {!selectedBranchId ? (
            <div className="py-12 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Building2 className="w-8 h-8 text-indigo-400/40 mx-auto mb-2" />
              <p className="text-slate-650 font-bold text-sm">Regional Hub Unselected</p>
              <p className="text-slate-400 text-xs mt-1">Please select an operational city hub above to check live medical stock.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredProducts.map(product => {
                const availableStock = product.stock?.[selectedBranchId] || 0;
                const inCart = cart.find(item => item.product.id === product.id);

                return (
                  <div key={product.id} className="border border-slate-100 rounded-xl p-4 bg-white flex flex-col justify-between hover:border-slate-200 hover:shadow-xs transition-all">
                    <div>
                      {/* Image or generic */}
                      <div className="w-full h-28 bg-slate-50 rounded-lg mb-3 border border-slate-100 overflow-hidden shrink-0">
                        {product.imageUrl ? (
                          <img 
                            src={product.imageUrl} 
                            alt={product.name} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-350 font-mono text-2xl bg-indigo-50/40 select-none">
                            Rx
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 font-mono">
                          {product.category}
                        </span>
                        <h4 className="font-bold text-slate-800 leading-tight truncate">{product.name}</h4>
                        <p className="font-mono text-[10px] text-slate-400">SKU: {product.sku}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-55 bg-slate-50/50 -mx-4 -mb-4 p-4 rounded-b-xl flex items-center justify-between">
                      <div>
                        <div className="font-mono font-bold text-slate-900">₹{product.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-slate-405">Qty: {product.unit}</div>
                      </div>

                      <div>
                        {availableStock <= 0 ? (
                          <span className="text-[10px] font-semibold text-rose-500 bg-rose-50 px-2 py-1 rounded">
                            Out of Stock
                          </span>
                        ) : (
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[10px] font-bold font-mono text-slate-500">
                              Stock: {availableStock} {inCart ? `(${availableStock - inCart.quantity} left)` : ''}
                            </span>
                            <button
                              onClick={() => addToCart(product, availableStock)}
                              className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Add {inCart ? `(${inCart.quantity})` : ''}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-400 text-sm">
                  No medical supply items available.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cart and Destination */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs space-y-6 sticky top-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-1.5 text-slate-800">
              <ShoppingCart className="w-4 h-4 text-slate-700" />
              <h4 className="font-bold text-sm">Cart Consignment</h4>
            </div>
            <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-mono font-bold px-2 py-0.5 rounded-full">
              {cart.reduce((a, b) => a + b.quantity, 0)} items
            </span>
          </div>

          {/* Cart item listing */}
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {cart.map(item => {
              const availableStock = item.product.stock?.[selectedBranchId] || 0;
              return (
                <div key={item.product.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700 truncate">{item.product.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">₹{item.product.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })} each</p>
                  </div>

                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-[10px] text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                    <div className="flex items-center gap-1.5 mt-2 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                      <button 
                        onClick={() => updateQuantity(item.product.id, -1, availableStock)} 
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-xs font-black text-slate-800">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.product.id, 1, availableStock)} 
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {cart.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs font-medium">
                No medical items in consignment yet. Select your regional hub and choose products to add.
              </div>
            )}
          </div>

          {/* Total Value */}
          {cart.length > 0 && (() => {
            const discRate = currentUserProfile?.discountRate || 0;
            const sub = getTotalPrice();
            const discAmt = Math.round((sub * discRate) / 100);
            const finTotal = sub - discAmt;

            return (
              <div className="border-t border-slate-100 pt-3 space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-150">
                <div className="flex justify-between items-baseline text-xs text-slate-500">
                  <span>Subtotal Value:</span>
                  <span className="font-mono text-slate-700">₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {discRate > 0 && (
                  <div className="flex justify-between items-baseline text-xs text-[#166534] bg-emerald-50 px-2 py-1 rounded">
                    <span className="font-semibold">Hospital Discount ({discRate}%):</span>
                    <span className="font-mono font-extrabold">-₹{discAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline border-t border-slate-250/30 pt-2">
                  <span className="text-xs font-bold text-slate-800">Operational Pay Total:</span>
                  <span className="font-mono text-base font-black text-indigo-700">₹{finTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            );
          })()}

          {/* Destination Form details */}
          {cart.length > 0 && (
            <form onSubmit={handlePlaceOrder} className="space-y-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wide">
                <Landmark className="w-3.5 h-3.5 text-indigo-500" /> Destination Hospital
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Clinic/Hospital Name</label>
                <input
                  type="text"
                  required
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="e.g. St. Jude Surgical Wing"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg focus:outline-hidden text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Operations Delivery Address</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Sector 3, Healthcare Boulevard"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg focus:outline-hidden text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">On-Duty Coordinator Phone</label>
                <input
                  type="text"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+1 (555) 012-9834"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg focus:outline-hidden text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Fulfillment Notes / ER Urgency</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Direct to OT Floor 3, or Urgent dispatch..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-250 rounded-lg focus:outline-hidden text-xs h-16 resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
              >
                Assemble & Deliver Consignment
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
   </div>
  );
}
