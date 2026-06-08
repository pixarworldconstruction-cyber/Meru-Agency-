import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Branch, UserProfile } from '../types';
import { Building2, Search, Plus, MapPin, Phone, Trash2, Edit2, ShieldAlert } from 'lucide-react';

interface BranchesTabProps {
  currentUserProfile: UserProfile | null;
  branches: Branch[];
  setBranches?: React.Dispatch<React.SetStateAction<Branch[]>>;
  onMarkDeleted?: (branchId: string) => void;
}

export default function BranchesTab({ currentUserProfile, branches, setBranches, onMarkDeleted }: BranchesTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city.trim() || !address.trim() || !contactPhone.trim()) return;

    const path = 'branches';
    try {
      if (editingBranch) {
        const branchRef = doc(db, path, editingBranch.id);
        await updateDoc(branchRef, {
          name: name.trim(),
          city: city.trim(),
          address: address.trim(),
          contactPhone: contactPhone.trim(),
        });
        setEditingBranch(null);
      } else {
        await addDoc(collection(db, path), {
          name: name.trim(),
          city: city.trim(),
          address: address.trim(),
          contactPhone: contactPhone.trim(),
          createdAt: Date.now(),
        });
      }
      // Reset form
      setName('');
      setCity('');
      setAddress('');
      setContactPhone('');
      setShowAddForm(false);
    } catch (err) {
      handleFirestoreError(err, editingBranch ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setName(branch.name);
    setCity(branch.city);
    setAddress(branch.address);
    setContactPhone(branch.contactPhone);
    setShowAddForm(true);
  };

  const handleDelete = async (branchId: string) => {
    if (!window.confirm('Are you sure you want to delete this branch?')) return;
    const path = `branches/${branchId}`;
    try {
      await deleteDoc(doc(db, 'branches', branchId));
      if (onMarkDeleted) {
        onMarkDeleted(branchId);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
      if (onMarkDeleted) {
        onMarkDeleted(branchId);
      }
    }
  };

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="branches-tab" className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Branch Network</h2>
          <p className="text-slate-500 text-sm mt-1">Manage physical agency offices and distribution hubs across cities</p>
        </div>
        {isSuperAdmin && (
          <button
            id="add-branch-btn"
            onClick={() => {
              setEditingBranch(null);
              setShowAddForm(!showAddForm);
              if (!showAddForm) {
                setName('');
                setCity('');
                setAddress('');
                setContactPhone('');
              }
            }}
            className="flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            {showAddForm ? 'Cancel' : <><Plus className="w-4 h-4" /> Add New Branch</>}
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200/60 p-6 rounded-2xl space-y-4 animate-fadeIn">
          <h3 className="text-base font-semibold text-slate-800">
            {editingBranch ? 'Modify Branch Parameters' : 'Register New Regional Branch'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Branch/Hub Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Northeast Surgical Hub"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Operating City</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. New York, Chicago"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Warehouse / Office Address</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Building 4B, Sector 12, Healthcare Zone"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Phone Number</label>
              <input
                type="text"
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. +1 (555) 019-2834"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-sm font-medium transition-colors"
            >
              {editingBranch ? 'Save Changes' : 'Initialize Branch'}
            </button>
          </div>
        </form>
      )}

      {/* Modern Search */}
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
        {filteredBranches.map(branch => (
          <div key={branch.id} className="bg-white border border-slate-100 shadow-xs rounded-2xl flex flex-col hover:border-slate-200 transition-all">
            <div className="p-6 flex-1 space-y-4">
              <div className="flex items-start justify-between">
                <div className="bg-slate-100 text-slate-800 p-3 rounded-xl">
                  <Building2 className="w-5 h-5 text-slate-700" />
                </div>
                <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full">
                  {branch.city}
                </span>
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-800 leading-snug">{branch.name}</h4>
                <div className="mt-3 space-y-2 text-slate-600 text-xs">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{branch.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{branch.contactPhone}</span>
                  </div>
                </div>
              </div>
            </div>

            {isSuperAdmin && (
              <div className="border-t border-slate-50 px-6 py-3.5 flex justify-end gap-2 bg-slate-50/50 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => handleEdit(branch)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Edit Parameters"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(branch.id)}
                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Remove Branch"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}

        {filteredBranches.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-200/60 rounded-2xl text-center">
            <Building2 className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-slate-600 font-medium text-sm">No branches found matching "{searchTerm}"</p>
            <p className="text-slate-400 text-xs mt-1">Add branches to expand the network to other medical hubs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
