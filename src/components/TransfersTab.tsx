import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Branch, UserProfile, TransferDemand, TransferStatus } from '../types';
import { 
  ArrowRightLeft, Search, Plus, Trash2, Edit2, ShieldAlert, 
  CheckCircle2, XCircle, FileText, ClipboardList, Package, 
  ArrowUpRight, ArrowDownLeft, AlertCircle, RefreshCw 
} from 'lucide-react';
import { motion } from 'motion/react';

interface TransfersTabProps {
  currentUserProfile: UserProfile | null;
  branches: Branch[];
  products: Product[];
  transfers: TransferDemand[];
}

export default function TransfersTab({ currentUserProfile, branches, products, transfers }: TransfersTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const isBranchAdmin = currentUserProfile?.role === 'branch_admin';
  const userBranchId = currentUserProfile?.branchId;
  const activeBranch = branches.find(b => b.id === userBranchId);

  // Search & Navigation Filters Stateful variables
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [showDemandForm, setShowDemandForm] = useState(false);

  // Create Demand Form State variables
  const [selectedProductId, setSelectedProductId] = useState('');
  const [demandingBranchId, setDemandingBranchId] = useState(userBranchId || '');
  const [supplyingBranchId, setSupplyingBranchId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Selected Product reference for checking live stocks
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const availableInSupplying = selectedProduct && supplyingBranchId 
    ? (selectedProduct.stock?.[supplyingBranchId] || 0) 
    : 0;

  // Handles adding a new transfer request
  const handleCreateDemand = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!selectedProductId) {
      setFormError('Please select a product to demand.');
      return;
    }
    if (!demandingBranchId) {
      setFormError('Please specify the demanding branch.');
      return;
    }
    if (!supplyingBranchId) {
      setFormError('Please specify the supplying branch.');
      return;
    }
    if (demandingBranchId === supplyingBranchId) {
      setFormError('Demanding and Supplying branches must be different physical locations.');
      return;
    }
    if (quantity <= 0) {
      setFormError('Quantity must be 1 or more.');
      return;
    }

    setSubmitting(true);
    const prod = products.find(p => p.id === selectedProductId)!;
    const demBranch = branches.find(b => b.id === demandingBranchId)!;
    const supBranch = branches.find(b => b.id === supplyingBranchId)!;

    const path = 'transfers';
    try {
      await addDoc(collection(db, path), {
        demandingBranchId,
        demandingBranchName: demBranch.name,
        supplyingBranchId,
        supplyingBranchName: supBranch.name,
        productId: selectedProductId,
        productName: prod.name,
        sku: prod.sku,
        quantity,
        status: 'pending' as TransferStatus,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        requestedBy: currentUserProfile?.email || 'Unknown User',
      });

      setFormSuccess(`Successfully demanded ${quantity} units of ${prod.name} from ${supBranch.name}!`);
      // Reset form variables
      setSelectedProductId('');
      setSupplyingBranchId('');
      setQuantity(1);
      setTimeout(() => {
        setShowDemandForm(false);
        setFormSuccess('');
      }, 2500);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
      setFormError('Failed to log transfer demand: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  // Handles transferring the stock (resolving demand)
  const handleApproveTransfer = async (transfer: TransferDemand) => {
    const confirmMsg = `Are you sure you want to approve physical stock transfer of ${transfer.quantity} units of ${transfer.productName} from ${transfer.supplyingBranchName} to ${transfer.demandingBranchName}?`;
    if (!window.confirm(confirmMsg)) return;

    // Direct Stock verification
    const liveProduct = products.find(p => p.id === transfer.productId);
    if (!liveProduct) {
      alert('Error: The demanded product does not appear to exist in active catalog registries.');
      return;
    }

    const currentSupplyStock = liveProduct.stock?.[transfer.supplyingBranchId] || 0;
    if (currentSupplyStock < transfer.quantity) {
      const override = window.confirm(
        `Warning: Supplying branch (${transfer.supplyingBranchName}) only has ${currentSupplyStock} units of this product. Do you want to proceed and allow stock level to go negative?`
      );
      if (!override) return;
    }

    const batch = writeBatch(db);
    
    // 1. Update the transfer order document status
    const transferRef = doc(db, 'transfers', transfer.id);
    batch.update(transferRef, {
      status: 'completed' as TransferStatus,
      updatedAt: Date.now(),
      resolvedBy: currentUserProfile?.email || 'Unknown User'
    });

    // 2. Adjust Product Inventory balances in both branches
    const updatedStock = { ...(liveProduct.stock || {}) };
    updatedStock[transfer.supplyingBranchId] = (updatedStock[transfer.supplyingBranchId] || 0) - transfer.quantity;
    updatedStock[transfer.demandingBranchId] = (updatedStock[transfer.demandingBranchId] || 0) + transfer.quantity;

    const productRef = doc(db, 'products', liveProduct.id);
    batch.update(productRef, { stock: updatedStock });

    try {
      await batch.commit();
      alert('Transfer successful! Stock balances updated and synchronized in real-time.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transfers/${transfer.id}`);
      alert('Error finalizing transfer: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handles cancelling the demand
  const handleCancelTransfer = async (transfer: TransferDemand) => {
    if (!window.confirm('Are you sure you want to cancel this transfer demand request?')) return;

    const path = `transfers/${transfer.id}`;
    try {
      const transferRef = doc(db, 'transfers', transfer.id);
      await updateDoc(transferRef, {
        status: 'cancelled' as TransferStatus,
        updatedAt: Date.now(),
        resolvedBy: currentUserProfile?.email || 'Unknown User'
      });
      alert('Request successfully marked as Cancelled.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
      alert('Error cancelling request: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Filter transfers based on tab criteria and search pattern
  const filteredTransfers = transfers.filter(t => {
    // 1. Role boundaries and Sub-tab mapping
    if (isBranchAdmin) {
      if (activeSubTab === 'incoming' && t.supplyingBranchId !== userBranchId) return false;
      if (activeSubTab === 'outgoing' && t.demandingBranchId !== userBranchId) return false;
      // In 'all' subtab for branch admin, show either incoming or outgoing
      if (activeSubTab === 'all' && t.supplyingBranchId !== userBranchId && t.demandingBranchId !== userBranchId) return false;
    } else if (isSuperAdmin) {
      // Super Admin filters
      if (activeSubTab === 'incoming') {
        // Demands where requested from another branch but not the one being simulated (if any)
        if (userBranchId && t.supplyingBranchId !== userBranchId) return false;
      }
      if (activeSubTab === 'outgoing') {
        if (userBranchId && t.demandingBranchId !== userBranchId) return false;
      }
    }

    // 2. Status filters
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;

    // 3. Search query match
    const q = searchTerm.toLowerCase();
    return (
      t.productName.toLowerCase().includes(q) ||
      t.sku.toLowerCase().includes(q) ||
      t.demandingBranchName.toLowerCase().includes(q) ||
      t.supplyingBranchName.toLowerCase().includes(q)
    );
  });

  return (
    <div id="transfers-tab" className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-slate-700" />
            Internal Branch Transfers & Demands
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Request inventory supplies from other branches and fulfill incoming stock transfer order demands
          </p>
        </div>
        <button
          id="toggle-demand-btn"
          onClick={() => {
            setFormError('');
            setFormSuccess('');
            setShowDemandForm(!showDemandForm);
          }}
          className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer"
        >
          {showDemandForm ? 'Cancel Request' : (
            <>
              <Plus className="w-4 h-4" />
              Demand Sterile Product
            </>
          )}
        </button>
      </div>

      {/* New Demand Form */}
      {showDemandForm && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-50 border border-slate-200/60 p-6 rounded-2xl space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-200/50 pb-3 mb-2">
            <ClipboardList className="w-5 h-5 text-slate-600" />
            <h3 className="text-base font-bold text-slate-800">Initiate Branch-to-Branch Demand</h3>
          </div>

          <form onSubmit={handleCreateDemand} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Demand Source Branch choice */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-sans">
                Demanding Branch (Recipient)
              </label>
              {isSuperAdmin ? (
                <select
                  value={demandingBranchId}
                  onChange={(e) => setDemandingBranchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-slate-800"
                >
                  <option value="">-- Choose Demanding Hub --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                  ))}
                </select>
              ) : (
                <div className="px-3.5 py-2.5 bg-slate-100 border border-slate-250 rounded-xl text-sm text-slate-700 font-medium">
                  {activeBranch ? `${activeBranch.name} (${activeBranch.city})` : 'Active Assigned Branch'}
                </div>
              )}
            </div>

            {/* 2. Choose Supplier Branch */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-sans">
                Supplying Branch (Source)
              </label>
              <select
                required
                value={supplyingBranchId}
                onChange={(e) => setSupplyingBranchId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-slate-800"
              >
                <option value="">-- Select Supplying Hub --</option>
                {branches
                  .filter(b => b.id !== demandingBranchId)
                  .map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                  ))}
              </select>
            </div>

            {/* 3. Choose Sterile Product to Transfer */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-sans">
                Product Requested
              </label>
              <select
                required
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-slate-800"
              >
                <option value="">-- Select Consumable Item --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} [{p.sku}]</option>
                ))}
              </select>
            </div>

            {/* Live Stock Level Indicator Details */}
            {selectedProduct && supplyingBranchId && (
              <div className="md:col-span-3 bg-blue-50/60 border border-blue-100 text-blue-800 p-4 rounded-xl flex items-start gap-3">
                <Package className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <span>Live Stock Level Check:</span>
                  </div>
                  <div>
                    The selected supplying physical branch owns{' '}
                    <span className="font-bold underline text-blue-900">
                      {availableInSupplying} {selectedProduct.unit}s
                    </span>{' '}
                    of {selectedProduct.name} in warehouse storage right now.
                  </div>
                  {availableInSupplying === 0 && (
                    <div className="text-amber-700 font-bold flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Note: Source branch currently has no inventory in stock for this product.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quantity Choice */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-sans">
                Quantity Demanded (Pics / Boxes)
              </label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-slate-800"
              />
            </div>

            {/* Error & Success indicators */}
            <div className="md:col-span-3 space-y-2">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}
            </div>

            {/* Action Triggers */}
            <div className="md:col-span-3 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDemandForm(false)}
                className="px-4.5 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close Panel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-emerald-900 text-white hover:bg-emerald-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-55"
              >
                {submitting ? 'Creating Request...' : 'Publish Transfer Demand'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Tab Filter Control Bar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100">
        {/* Navigation Categories tab bar */}
        <div className="flex bg-slate-100 p-1 rounded-xl w-full lg:w-auto">
          <button
            onClick={() => setActiveSubTab('all')}
            className={`flex-1 lg:flex-none text-center px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Transfers
          </button>
          <button
            onClick={() => setActiveSubTab('incoming')}
            className={`flex-1 lg:flex-none text-center px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSubTab === 'incoming' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-blue-600" />
            Incoming Demands
          </button>
          <button
            onClick={() => setActiveSubTab('outgoing')}
            className={`flex-1 lg:flex-none text-center px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSubTab === 'outgoing' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
            Outgoing Demands
          </button>
        </div>

        {/* Status Filters dropdown plus Search query bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {/* Status badge choices */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-hidden"
          >
            <option value="all">Any Status</option>
            <option value="pending">Pending Requests</option>
            <option value="completed">Completed Transfers</option>
            <option value="cancelled">Cancelled Demands</option>
          </select>

          {/* Core Text Input queries */}
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by product SKU, name or branch..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 font-medium focus:outline-hidden focus:ring-1 focus:ring-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Grid representation list of transfers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTransfers.map((item) => {
          const liveProduct = products.find(p => p.id === item.productId);
          const supplyingStock = liveProduct?.stock?.[item.supplyingBranchId] ?? 0;
          const statusColors = {
            pending: 'bg-amber-50 border-amber-200 text-amber-800',
            completed: 'bg-emerald-50 border-emerald-200 text-emerald-800',
            cancelled: 'bg-slate-150 border-slate-200 hover:border-slate-300 text-slate-700'
          }[item.status];

          // Determine permission states:
          // Surat branch or super_admin can fulfill Vadodara branch's demand
          const isSupplierOfThisTransfer = item.supplyingBranchId === userBranchId;
          const canActionTransfer = isSuperAdmin || (isBranchAdmin && isSupplierOfThisTransfer);

          // Can cancellation be triggered? Requested branch or super_admin
          const isDemanderOfTransfer = item.demandingBranchId === userBranchId;
          const canCancelTransfer = isSuperAdmin || (isBranchAdmin && (isDemanderOfTransfer || isSupplierOfThisTransfer));

          return (
            <motion.div
              layout
              id={`transfer-item-${item.id}`}
              key={item.id}
              className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-200 hover:shadow-xs transition-all duration-250 font-sans"
            >
              <div className="space-y-4">
                {/* Header Meta parameters: Status & Date */}
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-extrabold tracking-wide uppercase px-2.5 py-1 rounded-full border ${statusColors}`}>
                    {item.status}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono tracking-tight font-medium">
                    {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                {/* Product Detail elements */}
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 truncate leading-snug">
                    {item.productName}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] bg-slate-100 font-mono text-slate-500 font-extrabold px-1.5 py-0.5 rounded-sm">
                      {item.sku}
                    </span>
                    <span className="text-[11px] text-slate-500 font-bold">
                      Requested: <span className="text-slate-800 underline font-black">{item.quantity} units</span>
                    </span>
                  </div>
                </div>

                {/* Logistics Direction elements (From Branch to To Branch) */}
                <div className="bg-slate-50 p-3 rounded-xl space-y-2 text-xs border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">From Location</span>
                    <span className="font-bold text-slate-700 truncate max-w-[150px]">{item.supplyingBranchName}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200/50 pt-2">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">To Location</span>
                    <span className="font-bold text-slate-700 truncate max-w-[150px]">{item.demandingBranchName}</span>
                  </div>
                </div>

                {/* Audit & Logistics Metadata logs */}
                <div className="text-[10px] font-mono text-slate-400 space-y-0.5 pt-1.5">
                  <div>Requested By: <span className="text-slate-500 font-medium">{item.requestedBy}</span></div>
                  {item.resolvedBy && (
                    <div>Resolved By: <span className="text-slate-500 font-medium">{item.resolvedBy}</span></div>
                  )}
                </div>
              </div>

              {/* Dynamic Operations Action Buttons panel */}
              {item.status === 'pending' && (
                <div className="border-t border-slate-100/80 pt-4.5 mt-5 flex items-center justify-end gap-2.5">
                  {canCancelTransfer && (
                    <button
                      type="button"
                      onClick={() => handleCancelTransfer(item)}
                      className="px-3.5 py-2 hover:bg-slate-100 text-slate-600 hover:text-slate-800 text-[11px] font-bold rounded-lg border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject/Cancel
                    </button>
                  )}

                  {canActionTransfer && (
                    <div className="relative group">
                      <button
                        type="button"
                        onClick={() => handleApproveTransfer(item)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-450" />
                        Transfer Stock
                      </button>

                      {/* Floating tooltip show supply branch live balances */}
                      <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-10 w-48 p-2 bg-[#0F172A] text-white text-[9px] rounded-md shadow-lg pointer-events-none font-sans leading-normal">
                        Supplier Storage Bal: {supplyingStock} {liveProduct?.unit || 'Units'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}

        {filteredTransfers.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-center">
            <ArrowRightLeft className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-slate-600 font-bold text-sm">No branch transfers found matches criteria</p>
            <p className="text-slate-400 text-xs mt-1">
              Select other filters or click "Demand Sterile Product" to trigger a new request.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
