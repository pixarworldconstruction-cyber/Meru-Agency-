import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Branch, UserProfile, BranchDiscount, DeliveryOrder, UserStaffMember } from '../types';
import { 
  ShoppingBag, Search, Plus, Minus, ShoppingCart, 
  MapPin, Phone, Building2, Calendar, FileText, Check, Landmark,
  User, Save, AlertTriangle, ShieldCheck, Tag, Users,
  CheckCircle2, Clock, Truck, PlayCircle, XCircle, CreditCard,
  DollarSign, ArrowRight, X, UserCheck, Activity, Printer, Info
} from 'lucide-react';

interface HospitalClientViewProps {
  currentUserProfile: UserProfile | null;
  products: Product[];
  branches: Branch[];
  discounts: BranchDiscount[];
  deliveries?: DeliveryOrder[]; // Live synced deliveries
}

interface CartItem {
  product: Product;
  quantity: number;
}

export default function HospitalClientView({ 
  currentUserProfile, 
  products, 
  branches,
  discounts,
  deliveries = []
}: HospitalClientViewProps) {
  // Navigation Sub Tab
  const [activeSubTab, setActiveSubTab ] = useState<'dashboard' | 'profile'>('dashboard');

  // Interactive Supply Purchasing Window
  const [isOrderWindowOpen, setIsOrderWindowOpen] = useState(false);

  // Search & Filtering
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // Selected ordering staff
  const [selectedOrderingStaffId, setSelectedOrderingStaffId] = useState<string>('');

  // Delivery destination states (autofilled from profile)
  const [hospitalName, setHospitalName] = useState(currentUserProfile?.hospitalName || '');
  const [address, setAddress] = useState(currentUserProfile?.hospitalAddress || '');
  const [contactPhone, setContactPhone] = useState(currentUserProfile?.hospitalPhone || '');
  const [notes, setNotes] = useState('');

  // Staff additions fields (up to 3)
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffDesignation, setNewStaffDesignation] = useState('');
  const [staffError, setStaffError] = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');

  // Profile fields editing states
  const [profileHospitalName, setProfileHospitalName] = useState(currentUserProfile?.hospitalName || '');
  const [profileCity, setProfileCity] = useState(currentUserProfile?.hospitalCity || '');
  const [profileAddress, setProfileAddress] = useState(currentUserProfile?.hospitalAddress || '');
  const [profileCoordinator, setProfileCoordinator] = useState(currentUserProfile?.coordinatorName || currentUserProfile?.displayName || '');
  const [profilePhone, setProfilePhone] = useState(currentUserProfile?.hospitalPhone || '');

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSavedSuccess, setProfileSavedSuccess] = useState('');

  // Post-order temporary dashboard alert details
  const [dashboardAlert, setDashboardAlert] = useState<{ id: string; msg: string; total: number } | null>(null);

  // Financial statistics calculated from deliveries
  const hospitalDeliveries = deliveries.filter(d => d.hospitalUid === currentUserProfile?.uid);

  // Compute stats
  const lifetimeProcurementValue = hospitalDeliveries
    .filter(d => d.status !== 'cancelled')
    .reduce((acc, order) => acc + (order.finalTotal || 0), 0);

  const pendingShipmentsCount = hospitalDeliveries
    .filter(d => d.status === 'pending' || d.status === 'preparing' || d.status === 'shipping')
    .length;

  const totalOutstandingBalance = hospitalDeliveries
    .filter(d => d.status !== 'cancelled')
    .reduce((acc, order) => {
      const gross = order.finalTotal || 0;
      const advances = order.advancePayment || 0;
      const lumpSums = order.lumpSumPayment || 0;
      const paid = advances + lumpSums;
      return acc + (order.paymentStatus === 'paid' ? 0 : Math.max(0, gross - paid));
    }, 0);

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

  // Cart quantity controls
  const addToCart = (product: Product, availableStock: number) => {
    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    if (existingIndex > -1) {
      const updatedCart = [...cart];
      if (updatedCart[existingIndex].quantity < availableStock) {
        updatedCart[existingIndex].quantity += 1;
        setCart(updatedCart);
      } else {
        alert(`Fulfillment Limit: There are only ${availableStock} units physically in stock at this Logistics Center.`);
      }
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, increment: number, availableStock: number) => {
    const updatedCart = [...cart];
    const index = updatedCart.findIndex(item => item.product.id === productId);
    if (index > -1) {
      const newQuantity = updatedCart[index].quantity + increment;
      if (newQuantity <= 0) {
        removeFromCart(productId);
      } else if (newQuantity <= availableStock) {
        updatedCart[index].quantity = newQuantity;
        setCart(updatedCart);
      } else {
        alert(`Cannot allocate more than ${availableStock} units currently available in branch stock.`);
      }
    }
  };

  // Pricing calculations
  const getCartPricing = () => {
    let subtotal = 0;
    let totalDiscountAmount = 0;

    const itemsWithPricing = cart.map(item => {
      // Find branch specific custom discount
      const activeDiscount = discounts.find(d => 
        d.branchId === selectedBranchId && 
        d.hospitalUid === currentUserProfile?.uid && 
        d.productId === item.product.id
      );

      const appliedRate = activeDiscount ? activeDiscount.discountPercent : (currentUserProfile?.discountRate || 0);
      const isSpecific = !!activeDiscount;
      const rawCost = item.product.price * item.quantity;
      const discountVal = Math.round((item.product.price * (appliedRate / 100)) * item.quantity);
      
      subtotal += rawCost;
      totalDiscountAmount += discountVal;

      return {
        product: item.product,
        quantity: item.quantity,
        appliedRate,
        isSpecific,
        itemDiscount: discountVal
      };
    });

    const finalTotal = Math.max(0, subtotal - totalDiscountAmount);

    return {
      subtotal,
      totalDiscountAmount,
      finalTotal,
      items: itemsWithPricing
    };
  };

  // Filter products by search and category
  const categories = ['All', 'Sutures & Wound Closure', 'Orthopedic Implants', 'Anesthesia & Airway', 'PPE & Sterilization'];
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Order Submission with Auto-Close & Dashboard Redirect Flow
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) {
      alert('Please select your regional branch hub.');
      return;
    }
    if (cart.length === 0) {
      alert('Your procurement supply contains no items.');
      return;
    }
    if (!hospitalName.trim() || !address.trim() || !contactPhone.trim()) {
      alert('Please complete the hospital destination details.');
      return;
    }

    const { subtotal, totalDiscountAmount, finalTotal, items: parsedItems } = getCartPricing();

    const path = 'deliveries';
    try {
      const deliveryItems = parsedItems.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        price: item.product.price,
        appliedDiscountRate: item.appliedRate,
        appliedDiscountAmount: item.itemDiscount,
        isProductSpecific: item.isSpecific
      }));

      // Check selected staff details to record
      let staffNameRecord = '';
      if (selectedOrderingStaffId) {
        const found = currentUserProfile?.staffList?.find(s => s.id === selectedOrderingStaffId);
        if (found) {
          staffNameRecord = `${found.name} (${found.designation})`;
        }
      }

      // Create new Delivery Order document in Firestore
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
        discountPercent: currentUserProfile?.discountRate || 0,
        discountAmount: totalDiscountAmount,
        finalTotal: finalTotal,
        paymentStatus: 'pending',
        advancePayment: 0,
        lumpSumPayment: 0,
        outstandingBalance: finalTotal,
        orderedByStaff: staffNameRecord || currentUserProfile?.displayName || 'Coordinator'
      });

      // Atomically decrement stock in database
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

      // Trigger automatic closure back to dashboard
      setCart([]);
      setNotes('');
      setIsOrderWindowOpen(false); // CLOSE WINDOW AUTOMATICALLY!
      setDashboardAlert({
        id: docRef.id,
        msg: `Consignment request generated from hub: ${selectedBranch?.city}. Safe transit route established!`,
        total: finalTotal
      });
      
      // Auto dismiss success alert message after 6 seconds
      setTimeout(() => {
        setDashboardAlert(null);
      }, 7000);

    } catch (err) {
      console.error("Order submit failed: ", err);
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Hospital profile updater
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile?.uid) return;
    setIsSavingProfile(true);
    setProfileSavedSuccess('');
    const path = `users/${currentUserProfile.uid}`;
    try {
      const userRef = doc(db, 'users', currentUserProfile.uid);
      await updateDoc(userRef, {
        hospitalName: profileHospitalName.trim(),
        hospitalCity: profileCity.trim(),
        hospitalAddress: profileAddress.trim(),
        coordinatorName: profileCoordinator.trim(),
        hospitalPhone: profilePhone.trim(),
      });
      setProfileSavedSuccess('Hospital logistics coordinates synchronized successfully!');
      setTimeout(() => setProfileSavedSuccess(''), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Max 3 clinical staff members management
  const handleAddStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    setStaffSuccess('');

    if (!newStaffName.trim() || !newStaffPhone.trim() || !newStaffDesignation.trim()) {
      setStaffError('Please enter all parameters for this clinician/staff user.');
      return;
    }

    const currentStaffList = currentUserProfile?.staffList || [];
    if (currentStaffList.length >= 3) {
      setStaffError('Clinical limitation: Hospitals can authorize a maximum of 3 distinct users/staff members to order.');
      return;
    }

    const newStaff: UserStaffMember = {
      id: Math.random().toString(36).substring(2, 9),
      name: newStaffName.trim(),
      phone: newStaffPhone.trim(),
      designation: newStaffDesignation.trim()
    };

    const updatedStaffList = [...currentStaffList, newStaff];
    const path = `users/${currentUserProfile?.uid}`;

    try {
      if (currentUserProfile?.uid) {
        const userRef = doc(db, 'users', currentUserProfile.uid);
        await updateDoc(userRef, {
          staffList: updatedStaffList
        });
        setStaffSuccess(`Staff member ${newStaff.name} successfully registered.`);
        setNewStaffName('');
        setNewStaffPhone('');
        setNewStaffDesignation('');
        setTimeout(() => setStaffSuccess(''), 4000);
      }
    } catch (err) {
      setStaffError('Write privilege denied updating hospital staff directory.');
    }
  };

  // Remove a staff member
  const handleRemoveStaffMember = async (staffId: string) => {
    const currentStaffList = currentUserProfile?.staffList || [];
    const updatedStaffList = currentStaffList.filter(s => s.id !== staffId);
    
    if (currentUserProfile?.uid) {
      try {
        const userRef = doc(db, 'users', currentUserProfile.uid);
        await updateDoc(userRef, {
          staffList: updatedStaffList
        });
        setStaffSuccess('Staff member revoked and unassigned from procurement roster.');
        setTimeout(() => setStaffSuccess(''), 3000);
      } catch (err) {
        setStaffError('Could not delete staff member.');
      }
    }
  };

  // Check logistics status badge colors
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending': return 'text-slate-700 bg-slate-100 border-slate-205';
      case 'preparing': return 'text-indigo-700 bg-indigo-50 border-indigo-150';
      case 'shipping': return 'text-amber-800 bg-amber-50 border-amber-205';
      case 'delivered': return 'text-emerald-800 bg-emerald-50 border-emerald-205';
      case 'cancelled': return 'text-rose-800 bg-rose-50 border-rose-205';
      default: return 'text-slate-500 bg-slate-100';
    }
  };

  // Check payment status badge colors
  const getPaymentBadgeClass = (pStatus: string) => {
    switch (pStatus) {
      case 'paid': return 'text-emerald-800 bg-emerald-50 border-emerald-205';
      case 'partially_paid': return 'text-purple-850 bg-purple-50 border-purple-200';
      case 'pending': 
      default: 
        return 'text-rose-850 bg-rose-50 border-rose-200';
    }
  };

  return (
    <div id="hospital-dashboard-parent" className="space-y-6">
      
      {/* Dynamic Sub-Tab Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-205 pb-3 gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('dashboard')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'dashboard'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-4 h-4" /> 📊 Procurement Terminal
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('profile')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <User className="w-3.5 h-3.5" /> 🏥 Facility & Clinical Team
          </button>
        </div>

        {/* City Matching Alerts Display */}
        <div>
          {hasMatchedCity ? (
            <div className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-emerald-850 bg-emerald-50 border border-emerald-150 px-3 py-1 rounded-full gap-1 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>City: {hospitalCityValue} Hubs Synced</span>
            </div>
          ) : (
            <button
              onClick={() => setActiveSubTab('profile')}
              className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-amber-850 bg-amber-50 border border-amber-150 px-3 py-1 rounded-full gap-1.5 hover:bg-amber-100/60 transition-colors font-mono"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span>Configure city to filter hubs</span>
            </button>
          )}
        </div>
      </div>

      {/* Warning Alert if Clinical Profile is incomplete */}
      {(!currentUserProfile?.hospitalCity || !currentUserProfile?.hospitalAddress || !currentUserProfile?.coordinatorName || !currentUserProfile?.hospitalPhone) && (
        <div className="bg-amber-50 border border-amber-205 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fadeIn text-amber-900 shadow-2xs">
          <div className="flex gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-extrabold pb-0.5">Clinical Profile Incomplete</p>
              <p className="text-amber-705">Please configure your operational coordinates (City, Street Address, and Helpline Phone) inside the Profile settings to automatically link corresponding regional supply lines.</p>
            </div>
          </div>
          <button
            onClick={() => setActiveSubTab('profile')}
            className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 hover:text-indigo-800 hover:underline shrink-0 pl-7 sm:pl-0 font-mono"
          >
            Set Up Now
          </button>
        </div>
      )}

      {/* Dashboard Summary Subtab */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          
          {/* Success Banner immediately after order window closed */}
          {dashboardAlert && (
            <div className="bg-emerald-50 border-2 border-emerald-200 p-5 rounded-2xl flex items-start gap-4 animate-scaleUp text-slate-800 shadow-lg">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1 font-sans">
                <p className="text-sm font-extrabold text-emerald-950">Consignment Registered Successfully!</p>
                <p className="text-xs text-slate-600 mt-1">{dashboardAlert.msg}</p>
                <p className="text-[10px] font-bold text-indigo-700 font-mono mt-2 uppercase tracking-tight">Order Tracking ID: {dashboardAlert.id.toUpperCase()} | Total Allocated: ₹{dashboardAlert.total.toLocaleString('en-IN')}</p>
              </div>
              <button 
                onClick={() => setDashboardAlert(null)}
                className="text-slate-400 hover:text-slate-600 pb-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* KPI Dashboard Analytics Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 font-sans">
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">lifetime purchases</p>
                <p className="text-2xl font-black text-slate-800 mt-1.5">
                  ₹{lifetimeProcurementValue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-slate-450 mt-1">Sum value of of non-cancelled consignments</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <DollarSign className="w-5 h-5 animate-pulse" />
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">active shipments</p>
                <p className="text-2xl font-black text-[#854D0E] mt-1.5">{pendingShipmentsCount} requests</p>
                <p className="text-[11px] text-slate-450 mt-1">Pending, preparing, or in active transit</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50/75 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Truck className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono font-mono">outstanding balance</p>
                <p className="text-2xl font-black text-rose-805 mt-1.5">
                  ₹{totalOutstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md inline-block mt-1 font-semibold">Ledger Settlement Outstandings</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-50/70 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Central Call to Action - MAKE CONSIGNMENT ORDER BUTTON LINKED TO POP-UP WINDOW */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-2 z-10">
              <span className="text-[10px] font-extrabold pb-1 uppercase tracking-widest text-indigo-400 font-mono bg-indigo-950/50 px-3 py-1 rounded-md border border-indigo-800">
                Rapid Supply Procurement
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Generate Consignment Logistical Request</h2>
              <p className="text-slate-350 text-sm max-w-xl">
                Browse our surgical stapling catalogs, anatomical bone plates, and sterilization accessories. Orders route instantly to matching physical branch warehouses.
              </p>
            </div>

            <button
              onClick={() => setIsOrderWindowOpen(true)}
              className="px-6 py-4 bg-[#3B82F6] hover:bg-[#2563EB] text-white font-extrabold rounded-2xl text-xs sm:text-sm tracking-wider uppercase shadow-lg flex items-center gap-2 cursor-pointer transition-all shrink-0 z-10 active:scale-95"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>Make Consignment Order</span>
              <ArrowRight className="w-4 h-4 animate-bounce" />
            </button>

            {/* Ambient vector details in background */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#3B82F6]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
          </div>

          {/* Detailed Lists: 1) Shipments Tracker, 2) Billing Ledgers */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* Logistics Tracking Column */}
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-3xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <Truck className="w-5 h-5 text-indigo-500" /> Logistics & Transit Tracker
                  </h3>
                  <p className="text-[11px] text-slate-450 mt-0.5">Real-time shipping parameters of loaded orders</p>
                </div>
                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded font-mono">
                  {hospitalDeliveries.length} orders
                </span>
              </div>

              {/* Delivery items timeline */}
              <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                {hospitalDeliveries.map(order => {
                  const hub = branches.find(b => b.id === order.branchId);

                  return (
                    <div 
                      key={order.id} 
                      className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 hover:border-slate-200 transition-colors flex flex-col justify-between gap-3 text-xs"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-bold text-slate-800 font-mono text-xs">
                            ID: #{order.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Placed on: {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${getStatusBadgeClass(order.status)}`}>
                          {order.status}
                        </span>
                      </div>

                      <div className="bg-white px-3 py-2 rounded-lg border border-slate-105 space-y-1 text-[11px]">
                        <p className="text-slate-500 truncate"><strong className="text-slate-700">Device list:</strong> {order.items.map(it => `${it.quantity}x ${it.productName}`).join(', ')}</p>
                        <p className="text-slate-500"><strong className="text-slate-700 font-sans">Dispatching Hub:</strong> {hub?.city} Hub ({hub?.name})</p>
                        {order.orderedByStaff && (
                          <p className="text-slate-500 font-mono text-[10.5px]"><strong className="text-slate-700">Roster Staff:</strong> {order.orderedByStaff}</p>
                        )}
                        {order.notes && (
                          <p className="text-slate-500 italic mt-1 font-sans">"{order.notes}"</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {hospitalDeliveries.length === 0 && (
                  <div className="py-12 text-center text-slate-400 italic">
                    No procurement records logged yet. Click "Make Consignment Order" above to place your first order.
                  </div>
                )}
              </div>
            </div>

            {/* Invoices & Financial Settlement Ledger */}
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-3xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-500" /> Financial Settlement Invoices
                  </h3>
                  <p className="text-[11px] text-slate-450 mt-0.5">Audit tracking of invoices, advances, and outstanding lump sums</p>
                </div>
                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded font-mono">
                  ₹ ledgers
                </span>
              </div>

              {/* Invoice cards listing */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {hospitalDeliveries.map(order => {
                  const grossTotal = order.finalTotal || 0;
                  const advancePaid = order.advancePayment || 0;
                  const lumpSumPaid = order.lumpSumPayment || 0;
                  const totalSettled = advancePaid + lumpSumPaid;
                  const balanceDue = order.paymentStatus === 'paid' ? 0 : Math.max(0, grossTotal - totalSettled);

                  return (
                    <div 
                      key={order.id} 
                      className="border border-slate-100 rounded-xl p-4 bg-white hover:border-slate-200 transition-all flex flex-col justify-between gap-3 text-xs"
                    >
                      <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100 gap-2">
                        <div>
                          <p className="font-bold text-slate-800 font-mono">
                            Bill ID: #{order.id.slice(0, 10).toUpperCase()}
                          </p>
                          <p className="text-[10px] text-slate-500 font-semibold font-mono">Gross Total: ₹{grossTotal.toLocaleString('en-IN')}</p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${getPaymentBadgeClass(order.paymentStatus || 'pending')}`}>
                          {order.paymentStatus || 'pending'}
                        </span>
                      </div>

                      {/* Payment breakdowns progress bar chart */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-slate-650 font-mono">
                          <span>Paid: ₹{totalSettled.toLocaleString('en-IN')}</span>
                          <span className={`${balanceDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {balanceDue > 0 ? `Unsettled Balance: ₹${balanceDue.toLocaleString('en-IN')}` : 'Settled In Full'}
                          </span>
                        </div>

                        {/* Custom visual progress track bar */}
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full transition-all duration-500" 
                            style={{ width: `${Math.min(100, Math.round((totalSettled / (grossTotal || 1)) * 100))}%` }}
                          ></div>
                        </div>

                        {/* Breakdown specifics list */}
                        <div className="grid grid-cols-2 gap-2 text-[10.5px] text-slate-500 font-mono pt-1">
                          <div className="bg-slate-50 p-1.5 rounded-md text-slate-600">
                            🛡️ Advance: <span className="font-bold text-slate-800">₹{advancePaid.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="bg-slate-50 p-1.5 rounded-md text-slate-600">
                            💰 Lump Sums: <span className="font-bold text-slate-800">₹{lumpSumPaid.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {hospitalDeliveries.length === 0 && (
                  <div className="py-12 text-center text-slate-400 italic">
                    No financial ledger entries created yet.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}


      {/* INTERACTIVE FULL-SCREEN ORDER PURCHASE MODULE OVERLAY DISPLAY (MAKE ORDER WINDOW) */}
      {isOrderWindowOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-end animate-fadeIn">
          <div className="bg-white w-full max-w-5xl h-full shadow-2xl flex flex-col justify-between animate-slideLeft">
            
            {/* Header Control */}
            <div className="p-5 border-b border-slate-105 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-base">New Consignment Logistics Request</h3>
                  <p className="text-[11px] text-slate-400">Secure procurement and inventory stock reservation window</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  const confirm = window.confirm('Cancel active order assembly? Cart details will reset.');
                  if (confirm) {
                    setCart([]);
                    setIsOrderWindowOpen(false);
                  }
                }}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Cancel order window"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Inner scrollable procurement selection desk */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-slate-50/40">
              
              {/* Hub Selection row */}
              <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-800 font-sans">
                    <Building2 className="w-4.5 h-4.5 text-indigo-501 text-indigo-500" />
                    <h4 className="font-bold text-sm">Select Dispatch Regional Logistics Hub</h4>
                  </div>
                  {hasMatchedCity && (
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-50 px-2 py-1 rounded tracking-wide font-mono">
                      🏙️ Matching: {hospitalCityValue}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {displayBranches.map(branch => (
                    <button
                      key={branch.id}
                      onClick={() => {
                        setSelectedBranchId(branch.id);
                        setCart([]); // Reset items if hub switches
                      }}
                      className={`p-3.5 rounded-lg border text-left text-xs transition-all flex flex-col justify-between ${
                        selectedBranchId === branch.id 
                          ? 'border-indigo-600 bg-indigo-50/30 font-bold ring-2 ring-indigo-500/10' 
                          : 'border-slate-150 bg-white hover:border-slate-350'
                      }`}
                    >
                      <div>
                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase font-mono">{branch.city}</span>
                        <h5 className="font-bold text-slate-800 mt-2 truncate leading-tight">{branch.name}</h5>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 truncate">{branch.address}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Catalog & Checkout columns split */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                
                {/* Catalog list */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Category Filter and Search */}
                  <div className="bg-white border border-slate-105 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                    
                    {/* Category selectors */}
                    <div className="flex gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            selectedCategory === cat 
                              ? 'bg-slate-900 text-white' 
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-750'
                          }`}
                        >
                          {cat.split(' ')[0]}
                        </button>
                      ))}
                    </div>

                    {/* Quick Search */}
                    <div className="relative w-full sm:w-48 shrink-0">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filter SKU name..."
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Operational devices grids */}
                  {!selectedBranchId ? (
                    <div className="py-12 bg-white rounded-2xl border text-center font-sans space-y-1">
                      <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-slate-800 font-bold text-sm">Logistics Hub Not Bound</p>
                      <p className="text-slate-450 text-xs">Choose one of the active logistics support centers to check real stock counters.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredProducts.map(product => {
                        const inStock = product.stock?.[selectedBranchId] || 0;
                        const inCart = cart.find(item => item.product.id === product.id);

                        const activeDiscount = discounts.find(d => 
                          d.branchId === selectedBranchId && 
                          d.hospitalUid === currentUserProfile?.uid && 
                          d.productId === product.id
                        );
                        const appliedRate = activeDiscount ? activeDiscount.discountPercent : (currentUserProfile?.discountRate || 0);
                        const hasDiscount = appliedRate > 0;
                        const discountPrice = product.price * (1 - appliedRate / 100);

                        return (
                          <div 
                            key={product.id} 
                            className="bg-white border border-slate-105 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-all text-xs shadow-3xs"
                          >
                            <div className="space-y-2">
                              <div className="flex justify-between items-start gap-1">
                                <span className="text-[9px] font-black uppercase text-indigo-500 font-mono">{product.category}</span>
                                <span className="text-[10px] text-slate-400 font-mono">SKU: {product.sku}</span>
                              </div>
                              <h5 className="font-bold text-slate-800 leading-tight leading-4 truncate" title={product.name}>
                                {product.name}
                              </h5>
                              <p className="text-[11px] text-slate-450 line-clamp-2 leading-tight">{product.description}</p>
                              
                              {hasDiscount && (
                                <div className="inline-flex items-center gap-1 bg-emerald-50 text-[#166534] text-[9.5px] font-black px-2 py-0.5 rounded-md border border-emerald-150">
                                  <Tag className="w-2.5 h-2.5" />
                                  <span>{activeDiscount ? 'Product Pack Special: ' : 'Hospital Rate: '}{appliedRate}% Off</span>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                              <div>
                                {hasDiscount ? (
                                  <>
                                    <div className="text-[9.5px] text-slate-400 line-through">₹{product.price.toLocaleString('en-IN')}</div>
                                    <div className="font-mono font-extrabold text-[#166534] text-xs">₹{discountPrice.toLocaleString('en-IN')}</div>
                                  </>
                                ) : (
                                  <div className="font-bold font-mono text-slate-800">₹{product.price.toLocaleString('en-IN')}</div>
                                )}
                                <span className="text-[9.5px] text-slate-400">{product.unit} pack</span>
                              </div>

                              <div className="text-right">
                                {inStock <= 0 ? (
                                  <span className="text-[9.5px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded">Out of Stock</span>
                                ) : (
                                  <div className="space-y-1">
                                    <p className="text-[9.5px] font-bold font-mono text-slate-400">Stock: {inStock}</p>
                                    <button
                                      onClick={() => addToCart(product, inStock)}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-3 py-1.5 rounded-lg text-[10px] uppercase cursor-pointer"
                                    >
                                      Add {inCart ? `(${inCart.quantity})` : ''}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Shopping items and final dispatch details summary */}
                <div className="bg-white border border-slate-105 p-5 rounded-2xl shadow-3xs space-y-6">
                  <div className="border-b pb-3 flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1">
                      <ShoppingCart className="w-4 h-4 text-indigo-500" /> Procurement List
                    </h4>
                    <span className="bg-indigo-50 text-indigo-700 font-mono text-xs font-black px-2.5 py-0.5 rounded-full">
                      {cart.reduce((acc, it) => acc + it.quantity, 0)} items
                    </span>
                  </div>

                  {/* Line item rows inside order window */}
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {cart.map(item => {
                      const activeDiscount = discounts.find(d => 
                        d.branchId === selectedBranchId && 
                        d.hospitalUid === currentUserProfile?.uid && 
                        d.productId === item.product.id
                      );
                      const rate = activeDiscount ? activeDiscount.discountPercent : (currentUserProfile?.discountRate || 0);
                      const discPrice = item.product.price * (1 - rate / 100);

                      return (
                        <div key={item.product.id} className="bg-slate-50 p-2 rounded-lg border flex justify-between gap-1.5 text-[11px]">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-800 truncate" title={item.product.name}>{item.product.name}</p>
                            <p className="text-slate-450 font-mono text-[10px] mt-0.5">₹{discPrice.toLocaleString('en-IN')} x {item.quantity}</p>
                          </div>
                          <div className="flex gap-1 items-center shrink-0">
                            <button 
                              onClick={() => updateQuantity(item.product.id, -1, item.product.stock?.[selectedBranchId] || 999)}
                              className="w-5 h-5 bg-white border rounded text-slate-500 cursor-pointer"
                            >-</button>
                            <span className="font-mono font-bold px-1">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.product.id, 1, item.product.stock?.[selectedBranchId] || 999)}
                              className="w-5 h-5 bg-white border rounded text-slate-500 cursor-pointer"
                            >+</button>
                          </div>
                        </div>
                      );
                    })}

                    {cart.length === 0 && (
                      <p className="text-center py-6 text-slate-400 italic">Procurement Cart is empty.</p>
                    )}
                  </div>

                  {/* Financial computations summary list */}
                  {cart.length > 0 && (() => {
                    const { subtotal, totalDiscountAmount, finalTotal } = getCartPricing();
                    return (
                      <div className="bg-indigo-50/20 p-3 rounded-lg border border-indigo-100 text-[11px] space-y-1 font-mono">
                        <div className="flex justify-between text-slate-500">
                          <span>Gross Value:</span>
                          <span>₹{subtotal.toLocaleString('en-IN')}</span>
                        </div>
                        {totalDiscountAmount > 0 && (
                          <div className="flex justify-between text-[#166534] font-bold">
                            <span>Discounts:</span>
                            <span>-₹{totalDiscountAmount.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-indigo-805 font-black text-xs border-t border-indigo-150 pt-1.5 mt-1">
                          <span>Final Total:</span>
                          <span>₹{finalTotal.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Destination Details Form */}
                  {cart.length > 0 && (
                    <form onSubmit={handlePlaceOrder} className="space-y-4 pt-3 border-t">
                      
                      {/* Authorized Staff Coordinator Selection! IMPLEMENTS MULTIPLE PEOPLE DISPATCH CHECKBOX LIST/SELECT! */}
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          👤 Authorizing Order Clinician / Staff member
                        </label>
                        <select
                          value={selectedOrderingStaffId}
                          onChange={(e) => setSelectedOrderingStaffId(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden text-xs text-slate-700 font-semibold"
                        >
                          <option value="">{currentUserProfile?.displayName} (Active Profile Coordinator)</option>
                          {currentUserProfile?.staffList?.map(staff => (
                            <option key={staff.id} value={staff.id}>
                              {staff.name} - {staff.designation} ({staff.phone})
                            </option>
                          ))}
                        </select>
                        <p className="text-[9.5px] text-slate-400 mt-1">Select one of your registered on-duty medical professionals to sign this consignment receipt.</p>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Destination Clinic/Hospital</label>
                        <input
                          type="text"
                          required
                          value={hospitalName}
                          onChange={(e) => setHospitalName(e.target.value)}
                          placeholder="e.g. Memorial Surgery Wing"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Logistics Destination address</label>
                        <input
                          type="text"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Road 14, Area B"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Helpline Phone Number</label>
                        <input
                          type="text"
                          required
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="+1 (555) 012-4932"
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Fulfillment instructions / ER Urgency</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Fulfillment instructions..."
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs h-14 resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-slate-900 border border-transparent text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all cursor-pointer shadow-md text-center inline-block"
                      >
                        Confirm Consignment Order
                      </button>
                    </form>
                  )}
                </div>

              </div>

            </div>
          </div>
        </div>
      )}


      {/* Hospital Profile & Clinical Team Management Tab */}
      {activeSubTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fadeIn">
          
          {/* Main profile updating form coordinates */}
          <div className="lg:col-span-2 bg-white border border-slate-105 p-6 rounded-2xl shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 border-b pb-3">
              <Landmark className="w-5 h-5 text-indigo-500" /> Hospital Operational Coordinates
            </h3>

            {profileSavedSuccess && (
              <div className="p-3 bg-emerald-50 border-2 border-emerald-150 text-emerald-850 rounded-xl text-xs font-semibold flex items-center gap-1.5 font-sans">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{profileSavedSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                <div>
                  <label className="block text-xs font-bold text-slate-605 mb-1.5" htmlFor="field-hospital">Full Facility Clinical Name</label>
                  <input
                    type="text"
                    required
                    id="field-hospital"
                    value={profileHospitalName}
                    onChange={(e) => setProfileHospitalName(e.target.value)}
                    placeholder="e.g. St. Jude Surgical Wing"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm text-slate-800 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-605 mb-1.5" htmlFor="field-city">Operating City</label>
                  <input
                    type="text"
                    required
                    id="field-city"
                    value={profileCity}
                    onChange={(e) => setProfileCity(e.target.value)}
                    placeholder="e.g. Chicago"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm text-slate-805 font-bold font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">Must match city name exactly to map corresponding physical warehouses automatically.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-605 mb-1.5" htmlFor="field-coord">Head Coordinator Name</label>
                  <input
                    type="text"
                    required
                    id="field-coord"
                    value={profileCoordinator}
                    onChange={(e) => setProfileCoordinator(e.target.value)}
                    placeholder="e.g. Dr. Sarah Paul"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm text-slate-850"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-605 mb-1.5" htmlFor="field-phone">Roster Emergency Phone</label>
                  <input
                    type="text"
                    required
                    id="field-phone"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="e.g. +1 (312) 555-0199"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-sm tracking-wide font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-605 mb-1.5" htmlFor="field-address">Physical Logistics Street Address</label>
                  <textarea
                    required
                    id="field-address"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    placeholder="e.g. 840 Healthcare Way, Suite 302, Sector 14"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-203 rounded-xl focus:outline-hidden text-sm h-24 resize-none text-slate-705"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {isSavingProfile ? 'Synchronizing coordinates...' : 'Save Logistics Profile'}
                </button>
              </div>
            </form>
          </div>

          {/* ADD UP TO 3 CLINICAL/STAFF USERS PANEL! */}
          <div className="bg-white border border-slate-105 p-6 rounded-2xl shadow-xs space-y-5">
            <div className="border-b pb-3 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                  <Users className="w-5 h-5 text-indigo-500" /> Clinical Team (Max 3 staff)
                </h3>
                <p className="text-[11px] text-slate-450 mt-0.5">Roster of medical representatives authorized to order</p>
              </div>
              <span className="text-[10px] font-black tracking-widest font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded">
                {(currentUserProfile?.staffList || []).length} / 3 staff
              </span>
            </div>

            {staffSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-850 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 font-sans">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{staffSuccess}</span>
              </div>
            )}

            {staffError && (
              <div className="p-3 bg-rose-50 border border-rose-150 text-rose-855 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 font-sans">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>{staffError}</span>
              </div>
            )}

            {/* List of current authorized personnel staff members */}
            <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
              {(currentUserProfile?.staffList || []).map(staff => (
                <div 
                  key={staff.id} 
                  className="bg-slate-50 p-3 rounded-xl border border-slate-101 flex justify-between items-start gap-2.5 leading-tight text-xs"
                >
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-500" /> {staff.name}
                    </p>
                    <p className="text-[10.5px] font-mono text-indigo-700 font-bold uppercase tracking-tight">{staff.designation}</p>
                    <p className="text-[10px] text-slate-400">Phone: {staff.phone}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveStaffMember(staff.id)}
                    className="text-[10px] font-bold text-rose-650 hover:text-rose-800 bg-rose-100/30 hover:bg-rose-100/80 px-2 py-1 rounded transition-colors cursor-pointer shrink-0"
                    title="Remove user permissions"
                  >
                    Revoke
                  </button>
                </div>
              ))}

              {(currentUserProfile?.staffList || []).length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50/50 border border-dashed rounded-xl">
                  No staff registered besides active coordinator profile. Register clinicians up to 3 people below!
                </div>
              )}
            </div>

            {/* Form to append staff member */}
            {(currentUserProfile?.staffList || []).length < 3 ? (
              <form onSubmit={handleAddStaffMember} className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-widest font-mono">➕ Authorize Clinician</h4>

                <div>
                  <label className="block text-[10px] font-bold text-slate-450 mb-1">Full Representative Name</label>
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="e.g. Dr. Sarah Paul"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-150 rounded-lg text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 mb-1">Roster Phone</label>
                    <input
                      type="text"
                      required
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      placeholder="+1 (312) 555-0105"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-150 rounded-lg text-xs tracking-wide font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 mb-1">Designation</label>
                    <input
                      type="text"
                      required
                      value={newStaffDesignation}
                      onChange={(e) => setNewStaffDesignation(e.target.value)}
                      placeholder="e.g. Lead Surgeon"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-150 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer transition-colors text-center"
                >
                  Register On-Duty Clinician
                </button>
              </form>
            ) : (
              <div className="bg-amber-100/30 p-3 rounded-xl border text-[10px] text-slate-500 font-sans flex items-start gap-1.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Roster full (Capacity of 3 users reached). Granting additional clinicians requires revoking permissions from one of the active representatives above.</span>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
