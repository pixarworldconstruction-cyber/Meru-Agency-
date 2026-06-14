import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Branch, UserProfile, Product } from '../types';
import { 
  Building2, Search, Plus, MapPin, Phone, Trash2, Edit2, ShieldAlert,
  User, Mail, Clock, Database, Activity, Check, ShieldCheck, AlertCircle, 
  Settings, X, Info
} from 'lucide-react';

interface BranchesTabProps {
  currentUserProfile: UserProfile | null;
  branches: Branch[];
  setBranches?: React.Dispatch<React.SetStateAction<Branch[]>>;
  onMarkDeleted?: (branchId: string) => void;
  products?: Product[];
}

export default function BranchesTab({ 
  currentUserProfile, 
  branches, 
  setBranches, 
  onMarkDeleted, 
  products = [] 
}: BranchesTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const isBranchAdmin = currentUserProfile?.role === 'branch_admin';
  const userBranchId = currentUserProfile?.branchId;

  // UI Control State
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [modalSearchTerm, setModalSearchTerm] = useState('');

  // Primary Branch Form State
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  
  // Custom richer profile parameters
  const [managerName, setManagerName] = useState('');
  const [email, setEmail] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [status, setStatus] = useState<'active' | 'maintenance' | 'closed'>('active');
  const [capacityValue, setCapacityValue] = useState<number>(1000);

  // Authorization Checkers
  const canEditBranch = (branch: Branch) => {
    if (isSuperAdmin) return true;
    if (isBranchAdmin && userBranchId === branch.id) return true;
    return false;
  };

  const canDeleteBranch = (branch: Branch) => {
    return isSuperAdmin; // Strictly restricted to Super Admin
  };

  // Submit Handler for Creating or Modifying Branches
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city.trim() || !address.trim() || !contactPhone.trim()) return;

    const path = 'branches';
    const payload = {
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      contactPhone: contactPhone.trim(),
      managerName: managerName.trim() || 'Unassigned Hub Coordinator',
      email: email.trim() || 'hub@medlogix.com',
      operatingHours: operatingHours.trim() || '08:00 AM - 06:00 PM EST',
      status: status,
      capacityValue: Number(capacityValue) || 1000,
    };

    try {
      if (editingBranch) {
        const branchRef = doc(db, path, editingBranch.id);
        await updateDoc(branchRef, payload);
        
        // Update local modal if currently viewing the edited branch
        if (selectedBranch?.id === editingBranch.id) {
          setSelectedBranch(prev => prev ? { ...prev, ...payload } : null);
        }
        setEditingBranch(null);
      } else {
        await addDoc(collection(db, path), {
          ...payload,
          createdAt: Date.now(),
        });
      }
      // Reset form controls
      resetForm();
    } catch (err) {
      handleFirestoreError(err, editingBranch ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const resetForm = () => {
    setName('');
    setCity('');
    setAddress('');
    setContactPhone('');
    setManagerName('');
    setEmail('');
    setOperatingHours('');
    setStatus('active');
    setCapacityValue(1000);
    setEditingBranch(null);
    setShowAddForm(false);
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setName(branch.name);
    setCity(branch.city);
    setAddress(branch.address);
    setContactPhone(branch.contactPhone);
    setManagerName(branch.managerName || '');
    setEmail(branch.email || '');
    setOperatingHours(branch.operatingHours || '');
    setCapacityValue(branch.capacityValue || 1000);
    setStatus(branch.status || 'active');
    setShowAddForm(true);
    
    // Smooth scroll to top form if on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (branchId: string) => {
    if (!window.confirm('WARNING: Are you sure you want to retire this surgical branch hub from active service? This will delete its profiles.')) return;
    const path = `branches/${branchId}`;
    try {
      await deleteDoc(doc(db, 'branches', branchId));
      if (onMarkDeleted) {
        onMarkDeleted(branchId);
      }
      if (selectedBranch?.id === branchId) {
        setSelectedBranch(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
      if (onMarkDeleted) {
        onMarkDeleted(branchId);
      }
    }
  };

  const getStatusBadge = (bStatus: 'active' | 'maintenance' | 'closed' = 'active') => {
    switch (bStatus) {
      case 'active':
        return (
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Operational
          </span>
        );
      case 'maintenance':
        return (
          <span className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
            Maintenance
          </span>
        );
      case 'closed':
        return (
          <span className="bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
            Offline
          </span>
        );
    }
  };

  // Helper calculating real-time inventory quantity at a specific branch
  const getBranchInventoryData = (branchId: string) => {
    const branchProducts = products.map(p => ({
      ...p,
      qty: p.stock?.[branchId] || 0
    }));
    const totalUnits = branchProducts.reduce((acc, p) => acc + p.qty, 0);
    return {
      totalUnits,
      productsWithStock: branchProducts
    };
  };

  // Branches matching query
  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Retrieve Branch Admin's Specific Branch for Profile Summary Banner
  const myAssignedBranch = isBranchAdmin 
    ? branches.find(b => b.id === userBranchId) 
    : null;

  const myBranchStats = myAssignedBranch 
    ? getBranchInventoryData(myAssignedBranch.id) 
    : null;

  return (
    <div id="branches-tab" className="space-y-6">
      
      {/* Branch Admin Top Dedicated Hub Profile Card */}
      {isBranchAdmin && myAssignedBranch && (
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-3xl p-6 border border-indigo-950 shadow-lg space-y-6 animate-fadeIn">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-indigo-800/40 pb-5">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 text-[#3B82F6] p-3.5 rounded-2xl border border-white/5 shadow-inner">
                <Building2 className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 font-mono">My Assigned Warehouse Hub</span>
                <h2 className="text-xl font-extrabold tracking-tight mt-0.5">{myAssignedBranch.name}</h2>
                <p className="text-xs text-slate-300 font-medium font-sans flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-300" /> {myAssignedBranch.address}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2.5">
              {getStatusBadge(myAssignedBranch.status)}
              <button
                type="button"
                onClick={() => setSelectedBranch(myAssignedBranch)}
                className="bg-white/10 hover:bg-white/15 text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-white/10 cursor-pointer flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Activity className="w-3.5 h-3.5 text-indigo-300" />
                <span>Deep Audit Profile</span>
              </button>
              <button
                type="button"
                onClick={() => handleEdit(myAssignedBranch)}
                className="bg-[#3B82F6] hover:bg-blue-600 text-white font-black text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Adjust Settings</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1 text-slate-300">
            <div className="bg-slate-950/20 p-4 rounded-2xl border border-white/5 space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-400 font-mono">HUB COORDINATOR</span>
              </div>
              <p className="text-sm font-extrabold text-white">{myAssignedBranch.managerName || 'Coordinator Unassigned'}</p>
              <p className="text-[11px] text-slate-400">{myAssignedBranch.email || 'No official Email'}</p>
            </div>

            <div className="bg-slate-950/20 p-4 rounded-2xl border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold font-mono text-slate-400 mb-1">
                <span className="flex items-center gap-2"><Database className="w-4 h-4 text-indigo-400" /> STORAGE CAPACITY</span>
                <span>{myBranchStats ? myBranchStats.totalUnits : 0} / {myAssignedBranch.capacityValue || 1000} U</span>
              </div>
              {(() => {
                const totalStock = myBranchStats ? myBranchStats.totalUnits : 0;
                const capacity = myAssignedBranch.capacityValue || 1000;
                const percent = Math.min(100, Math.round((totalStock / capacity) * 100));
                
                return (
                  <div className="space-y-1.5">
                    <div className="w-full bg-indigo-950 rounded-full h-2 overflow-hidden border border-indigo-900/40">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${percent > 85 ? 'bg-rose-500' : percent > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-300">Warehouse limits utilize <strong>{percent}%</strong> of hardware space.</p>
                  </div>
                );
              })()}
            </div>

            <div className="bg-slate-950/20 p-4 rounded-2xl border border-white/5 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-400 font-mono">OPERATING TIMES</span>
              </div>
              <p className="text-sm font-extrabold text-white">{myAssignedBranch.operatingHours || 'Flexible Schedule'}</p>
              <div className="text-[11px] text-indigo-300 flex items-center gap-1 font-semibold">
                <Check className="w-3 h-3" /> Live Dispatch & Supply Auditing
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Branch Profile Directory</h2>
          <p className="text-slate-500 text-sm mt-1">Manage physical supply hubs, contact coordinators, status, and device warehousing capacity limits.</p>
        </div>
        {isSuperAdmin && (
          <button
            id="add-branch-btn"
            onClick={() => {
              setEditingBranch(null);
              setShowAddForm(!showAddForm);
              if (!showAddForm) resetForm();
            }}
            className="flex items-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm transition-colors"
          >
            {showAddForm ? 'Hide Form' : <><Plus className="w-4 h-4" /> Add Regional Hub</>}
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200/60 p-6 rounded-2xl space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              {editingBranch ? <Edit2 className="w-4 h-4 text-indigo-600" /> : <Plus className="w-4 h-4 text-indigo-600" />}
              {editingBranch ? `Modify Branch Profile: ${editingBranch.name}` : 'Register New Regional Supply Branch'}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold p-1 hover:bg-slate-100 rounded"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Core parameters */}
            <div className="space-y-4">
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block font-mono">1. Local Placement & Dispatch</span>
              
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Branch / Distribution Hub Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Northeast Surgical Hub"
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Operating City</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Chicago"
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Contact Phone Number</label>
                  <input
                    type="text"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="e.g. +1 (312) 555-0104"
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Office / Depot Address</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Building 4B, Grid Sector 14A, Logistics Highway"
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm"
                />
              </div>
            </div>

            {/* Custom Richer profile Parameters */}
            <div className="space-y-4">
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block font-mono">2. Operational Details & Profile</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Hub Manager Name</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    placeholder="e.g. Dr. Sarah Jenkins"
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Official Hub Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. Northeast@medlogix.com"
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Operating Work Hours</label>
                <input
                  type="text"
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                  placeholder="e.g. 08:00 AM - 08:00 PM EST"
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Max Warehousing Space (Units)</label>
                  <input
                    type="number"
                    min="100"
                    required
                    value={capacityValue}
                    onChange={(e) => setCapacityValue(Math.max(100, parseInt(e.target.value, 10) || 1000))}
                    placeholder="e.g. 5000"
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Status of Branch operations</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'maintenance' | 'closed')}
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#3B82F6]/10 focus:outline-hidden text-sm font-semibold text-slate-800 cursor-pointer"
                  >
                    <option value="active">Active & Open</option>
                    <option value="maintenance">Maintenance Setup</option>
                    <option value="closed">Closed / Offline</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-xs transition-all"
            >
              {editingBranch ? 'Save Profile Parameters' : 'Deploy Regional Hub'}
            </button>
          </div>
        </form>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search branches by city, branch name, or address..."
          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm font-sans shadow-xs focus:outline-hidden focus:ring-2 focus:ring-slate-900/5 transition-all text-slate-800"
        />
      </div>

      {/* Grid of Branches */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBranches.map(branch => {
          const stats = getBranchInventoryData(branch.id);
          const maxCapacity = branch.capacityValue || 1000;
          const percent = Math.min(100, Math.round((stats.totalUnits / maxCapacity) * 100));

          return (
            <div 
              key={branch.id} 
              className={`bg-white border rounded-2xl flex flex-col hover:shadow-md transition-all group ${
                branch.id === userBranchId 
                  ? 'border-indigo-400 ring-2 ring-indigo-50/50' 
                  : 'border-slate-100'
              }`}
            >
              <div className="p-6 flex-1 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="bg-slate-50 border group-hover:bg-indigo-50/50 group-hover:border-indigo-100 text-slate-800 p-3 rounded-xl transition-all">
                    <Building2 className="w-5 h-5 text-slate-700 group-hover:text-indigo-600" />
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    {getStatusBadge(branch.status)}
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-bold tracking-wide uppercase px-2.5 py-1 rounded-md border text-center font-mono">
                      {branch.city}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-slate-800 leading-snug truncate" title={branch.name}>
                    {branch.name}
                  </h4>
                  {branch.managerName && (
                    <p className="text-[11px] text-slate-400 font-semibold font-sans">
                      Coordinator: <span className="text-slate-600 font-bold">{branch.managerName}</span>
                    </p>
                  )}
                </div>

                {/* Warehouse Stats Indicator */}
                <div className="space-y-1.5 pt-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold font-mono text-slate-400">
                    <span>WAREHOUSE CAPACITY</span>
                    <span>{stats.totalUnits} / {maxCapacity} U</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${percent > 85 ? 'bg-rose-500' : percent > 60 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="text-[9.5px] text-slate-400 italic">
                    Capacity status: {percent}% filled.
                  </p>
                </div>

                {/* Subdetails list */}
                <div className="pt-2 divide-y divide-slate-50 space-y-1.5 text-slate-600 text-xs">
                  <div className="flex items-center gap-2 pt-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate text-slate-500" title={branch.address}>{branch.address}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono text-slate-500">{branch.contactPhone}</span>
                  </div>
                </div>
              </div>

              {/* Action Operations Bar */}
              <div className="border-t border-slate-50 px-6 py-3.5 flex justify-between items-center bg-slate-50/20 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setModalSearchTerm('');
                    setSelectedBranch(branch);
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Info className="w-3.5 h-3.5" /> View Profile Specs
                </button>

                <div className="flex gap-1.5">
                  {canEditBranch(branch) && (
                    <button
                      type="button"
                      onClick={() => handleEdit(branch)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit Parameters"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  {canDeleteBranch(branch) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(branch.id)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove Hub Spec"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredBranches.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-200/60 rounded-2xl text-center">
            <Building2 className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-slate-600 font-bold text-sm">No branches matching "{searchTerm}"</p>
            <p className="text-slate-400 text-xs mt-1">Refine your search city parameters or add brand-new regional distribution hubs to expand your medical logistics chain.</p>
          </div>
        )}
      </div>

      {/* Rich Branch Profile Specifications Modal overlay */}
      {selectedBranch && (() => {
        const stats = getBranchInventoryData(selectedBranch.id);
        const maxCapacity = selectedBranch.capacityValue || 1000;
        const totalUnits = stats.totalUnits;
        const percent = Math.min(100, Math.round((totalUnits / maxCapacity) * 100));

        // Filter modal products based on search term
        const filteredModalProducts = stats.productsWithStock.filter(p => 
          p.name.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
          p.sku.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
          p.category.toLowerCase().includes(modalSearchTerm.toLowerCase())
        );

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-105 flex flex-col max-h-[90vh] overflow-hidden animate-scaleUp">
              
              {/* Profile Modal Header */}
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-650 text-indigo-100 p-3 rounded-2xl border border-indigo-700/10">
                    <Building2 className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold tracking-widest uppercase font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                        REGIONAL HUB SPECIFICATION
                      </span>
                      {getStatusBadge(selectedBranch.status)}
                    </div>
                    <h3 className="text-lg font-extrabold text-slate-900 mt-1">{selectedBranch.name}</h3>
                    <p className="text-slate-500 text-xs flex items-center gap-1 mt-0.5 font-sans">
                      <MapPin className="w-3.5 h-3.5" /> {selectedBranch.city}, USA
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedBranch(null)}
                  className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 border text-slate-500 hover:text-slate-700 rounded-lg text-sm font-black transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Profile Modal Body scroll area */}
              <div className="p-6 overflow-y-auto space-y-6">
                
                {/* Visual statistics grid & Core Profile */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Specs */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">Hub Logistics Profiles</h4>
                    
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3.5">
                      <div className="flex items-start gap-3">
                        <User className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold tracking-wider font-mono uppercase">Authorized Hub Manager</p>
                          <p className="text-xs font-bold text-slate-800 mt-0.5">{selectedBranch.managerName || 'Unassigned Coordinator'}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Mail className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold tracking-wider font-mono uppercase">Official Communications Email</p>
                          <p className="text-xs font-semibold text-slate-800 font-mono mt-0.5">{selectedBranch.email || 'depot@medlogix.com'}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Clock className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold tracking-wider font-mono uppercase">Operating Hours</p>
                          <p className="text-xs font-semibold text-slate-800 mt-0.5">{selectedBranch.operatingHours || '08:00 AM - 06:00 PM'}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Phone className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold tracking-wider font-mono uppercase">Support Contact Helpline</p>
                          <p className="text-xs font-semibold text-slate-800 font-mono mt-0.5">{selectedBranch.contactPhone}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold tracking-wider font-mono uppercase">Physical Address Coordinates</p>
                          <p className="text-xs font-semibold text-slate-800 mt-0.5">{selectedBranch.address}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Stock Capacity Gauge */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">Real-time Stock Capacity Gauge</h4>
                    
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-105 flex flex-col justify-between h-42">
                      <div className="flex justify-between items-center">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Current Live Cargo Stock</span>
                          <h5 className="text-xl font-extrabold text-[#3B82F6] font-mono">{totalUnits} Units</h5>
                        </div>
                        <div className="bg-[#3B82F6]/10 text-indigo-700 p-2.5 rounded-xl border border-indigo-100">
                          <Database className="w-5 h-5 text-indigo-600" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                          <span>Usage fill Status:</span>
                          <span className="font-bold">{percent}% filled</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3.5 overflow-hidden p-0.5 border">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${percent > 85 ? 'bg-rose-500' : percent > 60 ? 'bg-amber-400' : 'bg-indigo-600'}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-normal flex items-start gap-1 font-sans">
                        <Info className="w-3.5 h-3.5 text-indigo-505 shrink-0 mt-0.5" />
                        Capacity profile allocates up to <strong>{maxCapacity}</strong> sterilization devices, staples and implants to reside in physical reserves.
                      </p>
                    </div>

                    {/* Operational Warning block */}
                    {percent > 85 && (
                      <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-[11px] text-rose-800 flex items-start gap-2 animate-pulse font-sans">
                        <ShieldAlert className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>⚠️ STORAGE AREA WARNING:</strong> Warehouse capacity exceeded 85% safety margins. Prioritize stock transfer demands or clear pending hospital orders to avoid physical workspace blockade.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Warehouse Stock ledger List */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-2">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono flex items-center gap-1.5">
                      <Activity className="w-4.5 h-4.5 text-[#3b82f6]" />
                      Warehouse Inventory Ledger ({stats.productsWithStock.length} total entries)
                    </h4>
                    
                    {/* Inline Filter Search */}
                    <div className="relative w-full sm:w-60">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={modalSearchTerm}
                        onChange={(e) => setModalSearchTerm(e.target.value)}
                        placeholder="Search local stock..."
                        className="w-full bg-slate-50 pl-8 pr-3 py-1 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="border rounded-2xl overflow-hidden max-h-60 overflow-y-auto bg-[#F8FAFC]/55">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-slate-100/80 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                          <th className="py-2.5 px-4">Sterile product / SKU</th>
                          <th className="py-2.5 px-4">Designated Category</th>
                          <th className="py-2.5 px-4 text-center">Unit pack</th>
                          <th className="py-2.5 px-4 text-right">In-Hub Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                        {filteredModalProducts.map((p, idx) => {
                          const isLowStock = p.qty < 10 && p.qty > 0;
                          const isOut = p.qty === 0;

                          return (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-4">
                                <p className="font-bold text-slate-800 leading-normal">{p.name}</p>
                                <span className="font-mono text-[9px] text-slate-450 bg-slate-100 px-1 py-0.5 rounded border border-slate-150">
                                  SKU: {p.sku}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-500 font-semibold">{p.category}</td>
                              <td className="py-2.5 px-4 text-center text-slate-400 font-sans">{p.unit}</td>
                              <td className="py-2.5 px-4 text-right font-mono">
                                <div className="flex items-center justify-end gap-1.5">
                                  {isOut ? (
                                    <span className="bg-red-50 text-rose-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-rose-200">OUT OF STOCK</span>
                                  ) : isLowStock ? (
                                    <span className="bg-amber-50 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 animate-pulse">⚠️ REFILL</span>
                                  ) : null}
                                  <span className={`text-xs font-black ${isOut ? 'text-slate-350' : isLowStock ? 'text-amber-600' : 'text-slate-800'}`}>
                                    {p.qty}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {filteredModalProducts.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-400 text-xs italic">
                              No warehouse stock items matching query parameters found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Profile Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                <span className="text-[10px] text-slate-450 font-bold font-mono">MEDLOGIX SOLUTIONS HUB PLATFORM</span>
                <div className="flex gap-2">
                  {canEditBranch(selectedBranch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranch(null);
                        handleEdit(selectedBranch);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                    >
                      <Settings className="w-3.5 h-3.5" /> Adjust Profile Parameters
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedBranch(null)}
                    className="bg-white border hover:bg-slate-50 border-slate-250 text-slate-600 font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                  >
                    Close Specs
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
