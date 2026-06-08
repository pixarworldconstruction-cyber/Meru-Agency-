import React, { useState } from 'react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DeliveryOrder, Branch, UserProfile, Product, DeliveryStatus } from '../types';
import { 
  Truck, CheckCircle, Clock, AlertCircle, ShoppingBag, 
  MapPin, Phone, User, Calendar, RefreshCcw, XCircle, FileText, Printer,
  DollarSign, CreditCard, Coins, CheckSquare, Edit, Pocket
} from 'lucide-react';

interface DeliveriesTabProps {
  currentUserProfile: UserProfile | null;
  deliveries: DeliveryOrder[];
  branches: Branch[];
  products: Product[];
}

const STATUS_CONFIGS: { 
  [key in DeliveryStatus]: { label: string; bg: string; text: string; icon: any } 
} = {
  pending: { label: 'Pending Request', bg: 'bg-slate-50 border-slate-200/60', text: 'text-slate-750', icon: Clock },
  preparing: { label: 'Preparing Items', bg: 'bg-indigo-50 border-indigo-200/50', text: 'text-indigo-800', icon: RefreshCcw },
  shipping: { label: 'In Transit', bg: 'bg-[#FEF9C3] border-[#FEF9C3]', text: 'text-[#854D0E]', icon: Truck },
  delivered: { label: 'Delivered', bg: 'bg-[#DCFCE7] border-[#DCFCE7]', text: 'text-[#166534]', icon: CheckCircle },
  cancelled: { label: 'Cancelled', bg: 'bg-[#FEE2E2] border-[#FEE2E2]', text: 'text-[#991B1B]', icon: XCircle },
};

export default function DeliveriesTab({ currentUserProfile, deliveries, branches, products }: DeliveriesTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const isBranchAdmin = currentUserProfile?.role === 'branch_admin';
  const userBranchId = currentUserProfile?.branchId;

  const [selectedBranchFilter, setSelectedBranchFilter] = useState('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [printingOrder, setPrintingOrder] = useState<DeliveryOrder | null>(null);

  // Financial Editing States for Branch/Super Admins
  const [editingPaymentOrderId, setEditingPaymentOrderId] = useState<string | null>(null);
  const [inputPaymentStatus, setInputPaymentStatus] = useState<'pending' | 'partially_paid' | 'paid'>('pending');
  const [inputAdvancePaid, setInputAdvancePaid] = useState<string>('');
  const [inputLumpSumPaid, setInputLumpSumPaid] = useState<string>('');

  const activeBranch = branches.find(b => b.id === userBranchId);

  // Filtered deliveries based on roles and selection
  const filteredDeliveries = deliveries.filter(order => {
    // Role clearance
    if (isBranchAdmin && userBranchId) {
      if (order.branchId !== userBranchId) return false;
    } else if (isSuperAdmin) {
      if (selectedBranchFilter !== 'All' && order.branchId !== selectedBranchFilter) return false;
    }

    // Status filter
    if (selectedStatusFilter !== 'All' && order.status !== selectedStatusFilter) return false;

    return true;
  });

  const handleUpdateStatus = async (orderId: string, newStatus: DeliveryStatus) => {
    const confirmation = window.confirm(`Set status of delivery request to "${newStatus.toUpperCase()}"?`);
    if (!confirmation) return;

    const path = `deliveries/${orderId}`;
    try {
      const orderRef = doc(db, 'deliveries', orderId);
      
      // If we are changing status of stock-relevant actions, we can adjust stocks on delivery or just track
      await updateDoc(orderRef, {
        status: newStatus,
        updatedAt: Date.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleUpdatePayment = async (order: DeliveryOrder) => {
    const advanceVal = parseFloat(inputAdvancePaid) || 0;
    const lumpSumVal = parseFloat(inputLumpSumPaid) || 0;
    const grossVal = order.finalTotal || 0;
    const outstanding = Math.max(0, grossVal - (advanceVal + lumpSumVal));

    // Resolve payment status
    let resolvedStatus = inputPaymentStatus;
    if (advanceVal + lumpSumVal >= grossVal) {
      resolvedStatus = 'paid';
    } else if (advanceVal + lumpSumVal > 0) {
      resolvedStatus = 'partially_paid';
    }

    try {
      const orderRef = doc(db, 'deliveries', order.id);
      await updateDoc(orderRef, {
        paymentStatus: resolvedStatus,
        advancePayment: advanceVal,
        lumpSumPayment: lumpSumVal,
        outstandingBalance: outstanding,
        updatedAt: Date.now()
      });
      setEditingPaymentOrderId(null);
      alert('Financial and ledger settlement updated successfully!');
    } catch (err) {
      console.error("Failed to update payment status: ", err);
      alert('Could not update payment status on Firestore due to write permissions.');
    }
  };

  const startEditPayment = (order: DeliveryOrder) => {
    setEditingPaymentOrderId(order.id);
    setInputPaymentStatus(order.paymentStatus || 'pending');
    setInputAdvancePaid(order.advancePayment?.toString() || '0');
    setInputLumpSumPaid(order.lumpSumPayment?.toString() || '0');
  };

  return (
    <div id="deliveries-tab" className="space-y-6">
      {/* Header Overview */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Hospital Delivery & Logistical Requests</h2>
          <p className="text-slate-500 text-sm mt-1">
            {isBranchAdmin 
              ? `Authorized dispatch list for hospital orders routed to the ${activeBranch?.city || 'unassigned'} hub` 
              : 'Supervise regional fulfillment, shipping parameters, and operations.'}
          </p>
        </div>

        {/* Dashboard Quick Stats */}
        <div className="flex gap-4 shrink-0 font-sans">
          <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl text-center min-w-28">
            <div className="text-xs text-amber-700 font-bold uppercase tracking-wider">Pending</div>
            <div className="text-xl font-black text-amber-800 mt-1">
              {deliveries.filter(d => d.status === 'pending' && (isSuperAdmin || d.branchId === userBranchId)).length}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl text-center min-w-28">
            <div className="text-xs text-blue-700 font-bold uppercase tracking-wider">In Transit</div>
            <div className="text-xl font-black text-blue-800 mt-1">
              {deliveries.filter(d => d.status === 'shipping' && (isSuperAdmin || d.branchId === userBranchId)).length}
            </div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-center min-w-28">
            <div className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Completed</div>
            <div className="text-xl font-black text-emerald-800 mt-1">
              {deliveries.filter(d => d.status === 'delivered' && (isSuperAdmin || d.branchId === userBranchId)).length}
            </div>
          </div>
        </div>
      </div>

      {/* Sorting / Filter Panels */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-50 border border-slate-100 p-4 rounded-xl">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">Filters:</span>
        
        {/* Branch Filters (Visible only for Super Admin) */}
        {isSuperAdmin && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-600 font-medium mr-1">Region:</span>
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden text-slate-700"
            >
              <option value="All">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.city} ({b.name})</option>
              ))}
            </select>
          </div>
        )}

        {/* Status Filter */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-600 font-medium mr-1">Status:</span>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-hidden text-slate-700 font-medium"
          >
            <option value="All">All Orders</option>
            <option value="pending">Pending</option>
            <option value="preparing">Preparing</option>
            <option value="shipping">In Shipping</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Delivery Orders Container */}
      <div className="space-y-4">
        {filteredDeliveries.map(order => {
          const matchedBranch = branches.find(b => b.id === order.branchId);
          const currentStatus = STATUS_CONFIGS[order.status] || STATUS_CONFIGS['pending'];
          const StatusIcon = currentStatus.icon;

          return (
            <div 
              key={order.id} 
              className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden hover:border-slate-200 transition-all"
            >
              <div className="p-5 border-b border-slate-50 flex flex-col md:flex-row justify-between gap-4 bg-slate-50/20">
                <div className="flex items-start gap-3">
                  <div className="bg-slate-100 p-2.5 rounded-lg text-slate-700 mb-1">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-black text-slate-800 leading-tight">
                        {order.hospitalName}
                      </h4>
                      <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2.5 py-0.5 ${currentStatus.bg} ${currentStatus.text}`}>
                        {currentStatus.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      Tracking: {order.id.substring(0, 12).toUpperCase()} | Route: {matchedBranch?.city || 'Unknown Branch'} 
                    </p>
                  </div>
                </div>

                {/* Operations Actions for appropriate admins */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setPrintingOrder(order)}
                    className="border border-slate-205 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Print transaction receipt"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                    <span>Print Invoice</span>
                  </button>
                  {order.status === 'pending' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'preparing')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                    >
                      Acknowledge & Prepare
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'shipping')}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                    >
                      Dispatch / Ship
                    </button>
                  )}
                  {order.status === 'shipping' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'delivered')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                    >
                      Confirm Delivery
                    </button>
                  )}
                  {order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                      className="border border-rose-250 text-rose-500 hover:bg-rose-50 text-xs font-semibold px-3 py-2 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>

              {/* Order Specifics */}
              <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                {/* Hospital Address Section */}
                <div className="p-5 space-y-3.5 text-xs">
                  <h5 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] font-mono">Destination Address</h5>
                  <div className="space-y-2 text-slate-600">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>{order.address}, {order.city}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{order.contactPhone}</span>
                    </div>
                    {order.orderedByStaff && (
                      <div className="flex items-center gap-2 font-mono text-[10.5px]">
                        <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">Roster Staff: <strong className="text-slate-800">{order.orderedByStaff}</strong></span>
                      </div>
                    )}
                    {order.notes && (
                      <div className="mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex gap-2">
                        <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                        <span className="italic text-slate-500">"{order.notes}"</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Logistics Branch Status */}
                <div className="p-5 space-y-3.5 text-xs">
                  <h5 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] font-mono">Fulfillment Hub</h5>
                  <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 border border-slate-100">
                    <p className="font-bold text-slate-800">{matchedBranch?.name}</p>
                    <p className="text-slate-500 text-[11px]">{matchedBranch?.city} Logistics Center</p>
                    <p className="text-slate-405 text-[10px]">Office Contact: {matchedBranch?.contactPhone}</p>
                  </div>
                </div>

                {/* Items requested and total pricing */}
                <div className="p-5 space-y-3.5 text-xs">
                  <div>
                    <h5 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] font-mono mb-2">Requested Devices</h5>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {order.items.map((item, idx) => {
                        const hasProjDisc = item.isProductSpecific || (item.appliedDiscountRate && item.appliedDiscountRate > 0);
                        return (
                          <div key={idx} className="flex justify-between items-start gap-2 text-slate-705 bg-slate-50/40 p-1.5 rounded-md text-xs">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium block truncate text-slate-800">{item.productName}</span>
                              <span className="text-[10px] text-slate-400 font-mono block">SKU: {item.sku}</span>
                              {hasProjDisc && (
                                <span className={`text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 inline-flex items-center gap-1 border ${
                                  item.isProductSpecific 
                                    ? 'bg-emerald-55/10 border-emerald-200 text-[#166534]' 
                                    : 'bg-indigo-55/10 border-indigo-200 text-indigo-850'
                                }`}>
                                  {item.isProductSpecific ? `🎁 Product Offer: ${item.appliedDiscountRate}% Off` : `🏥 Facility Disc: ${item.appliedDiscountRate}% Off`}
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-bold bg-slate-200 text-slate-750 px-2 py-0.5 rounded text-[11px] shrink-0">
                              {item.quantity}x
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Calculating Order Value */}
                  <div className="pt-3 border-t border-slate-100 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {order.discountPercent && order.discountPercent > 0 ? (
                      <>
                        <div className="flex justify-between items-baseline text-[10px] text-slate-500">
                          <span>Ledger Subtotal:</span>
                          <span className="font-mono text-slate-700">₹{order.items.reduce((acc, it) => acc + (it.price * it.quantity), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-baseline text-[10px] text-emerald-700 font-semibold">
                          <span>Partner Disc ({order.discountPercent}%):</span>
                          <span className="font-mono">-₹{order.discountAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-200/50">
                          <span className="font-bold text-slate-800 text-[11px]">Final Total Value:</span>
                          <span className="font-mono text-sm font-extrabold text-indigo-700">₹{order.finalTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between items-baseline ">
                        <span className="font-semibold text-slate-500">Value of consignment:</span>
                        <span className="font-mono text-base font-bold text-[#4F46E5]">
                          ₹{order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* BRAND RECONCILIATION - STORES LUMP SUM AND ADvANCE PAYMENTS AS REQUESTED */}
                <div className="p-5 space-y-3 text-xs flex flex-col justify-between">
                  <div className="space-y-3">
                    <h5 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] font-mono">Financial Ledger Receipt</h5>
                    
                    {/* Financial Status view */}
                    <div className="bg-slate-55 bg-slate-50 p-3 rounded-xl border space-y-2">
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-slate-500 uppercase font-mono text-[9px] tracking-wide">Ledger Status:</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border text-center font-mono ${
                          order.paymentStatus === 'paid' 
                            ? 'text-emerald-800 bg-emerald-50 border-emerald-250' 
                            : order.paymentStatus === 'partially_paid' 
                              ? 'text-indigo-800 bg-indigo-50 border-indigo-200' 
                              : 'text-rose-800 bg-rose-50 border-rose-200'
                        }`}>
                          {order.paymentStatus || 'pending'}
                        </span>
                      </div>

                      <div className="space-y-1 font-mono text-[10.5px] text-slate-600">
                        <div className="flex justify-between">
                          <span>Advance Recd:</span>
                          <span className="font-bold text-slate-800">₹{(order.advancePayment || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Lump-Sum:</span>
                          <span className="font-bold text-slate-800">₹{(order.lumpSumPayment || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-205/60 pt-1 text-xs">
                          <span className="font-bold text-slate-700">Outstanding:</span>
                          <span className="font-extrabold text-indigo-700">₹{(order.outstandingBalance !== undefined ? order.outstandingBalance : Math.max(0, (order.finalTotal || 0) - ((order.advancePayment || 0) + (order.lumpSumPayment || 0)))).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment controls panel */}
                  <div className="pt-2">
                    {editingPaymentOrderId === order.id ? (
                      <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-205 space-y-3">
                        <p className="font-black font-mono text-[9px] uppercase text-amber-805 tracking-wider">Configure Settlement Ledger</p>
                        
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Manual Payment Status</label>
                            <select
                              value={inputPaymentStatus}
                              onChange={(e) => setInputPaymentStatus(e.target.value as any)}
                              className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px]"
                            >
                              <option value="pending">Pending</option>
                              <option value="partially_paid">Partially Paid</option>
                              <option value="paid">Paid</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Received Advance (₹)</label>
                            <input
                              type="number"
                              value={inputAdvancePaid}
                              onChange={(e) => setInputAdvancePaid(e.target.value)}
                              placeholder="₹ e.g. 5000"
                              className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Lump-Sum Payment (₹)</label>
                            <input
                              type="number"
                              value={inputLumpSumPaid}
                              onChange={(e) => setInputLumpSumPaid(e.target.value)}
                              placeholder="₹ e.g. 15000"
                              className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex gap-1.5 pt-1">
                          <button
                            onClick={() => handleUpdatePayment(order)}
                            className="flex-1 bg-emerald-650 hover:bg-emerald-700 bg-emerald-600 text-white font-extrabold text-[10px] py-1 rounded cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPaymentOrderId(null)}
                            className="flex-1 bg-slate-200 hover:bg-slate-350 bg-slate-300 text-slate-700 font-bold text-[10px] py-1 rounded cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditPayment(order)}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-205 rounded-xl text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Reconcile Payments</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredDeliveries.length === 0 && (
          <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-200/60 rounded-2xl">
            <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600 font-semibold text-sm">No delivery orders active under current parameters.</p>
            <p className="text-slate-400 text-xs mt-1">Hospital orders scheduled will appear here for processing.</p>
          </div>
        )}
      </div>

      {/* Invoice Printable Overlay Modal */}
      {printingOrder && (() => {
        const matchedBranch = branches.find(b => b.id === printingOrder.branchId);
        const sub = printingOrder.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const discRate = printingOrder.discountPercent || 0;
        const discAmt = printingOrder.discountAmount || Math.round((sub * discRate) / 100);
        const finalVal = printingOrder.finalTotal || (sub - discAmt);

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-xs print:p-0 print:bg-white print:relative print:inset-auto">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 print:shadow-none print:p-0 print:max-w-none border border-slate-105 flex flex-col">
              
              {/* Controls (hidden on device printing) */}
              <div className="flex items-center justify-between border-b pb-3 print:hidden">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Printer className="w-4 h-4 text-indigo-600" />
                  <span>Consignment Order Receipt</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="bg-indigo-650 hover:bg-indigo-755 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Receipt
                  </button>
                  <button
                    onClick={() => setPrintingOrder(null)}
                    className="bg-slate-105 hover:bg-slate-200 text-slate-600 font-bold text-xs px-4 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Invoice Main Content Area */}
              <div id="invoice-bill-sheet" className="font-sans space-y-6 print:space-y-6 bg-white p-2">
                {/* Invoice Letterhead */}
                <div className="flex justify-between items-start border-b border-slate-205 pb-5">
                  <div>
                    <span className="text-[10px] font-black tracking-widest text-[#3b82f6] bg-[#3b82f6]/10 px-2 py-0.5 rounded-md uppercase font-mono">
                      MedLogix Distribution
                    </span>
                    <h3 className="text-xl font-extrabold text-slate-905 mt-2">MEDLOGIX SOLUTIONS</h3>
                    <p className="text-slate-500 text-xs mt-0.5">Surgical Hardware & Operational Supply Chain</p>
                  </div>
                  <div className="text-right font-mono text-xs text-slate-600 space-y-1">
                    <p className="font-bold text-slate-900 text-sm">INVOICE BILL</p>
                    <p>Order ID: #{printingOrder.id.substring(0, 10).toUpperCase()}</p>
                    <p>Date Generated: {new Date(printingOrder.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p>Status: <span className="font-bold uppercase text-indigo-700">{printingOrder.status}</span></p>
                  </div>
                </div>

                {/* Client & Hub details */}
                <div className="grid grid-cols-2 gap-6 text-xs text-slate-600">
                  <div className="space-y-1.5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="font-bold text-slate-905 uppercase text-[10px] tracking-wider font-mono">Bill To (Hospital Client):</p>
                    <p className="font-bold text-slate-805 text-sm">{printingOrder.hospitalName}</p>
                    <p className="text-slate-600">{printingOrder.address}</p>
                    {printingOrder.orderedByStaff && (
                      <p className="text-slate-500 font-mono text-[10.5px]">Authorizing Staff: {printingOrder.orderedByStaff}</p>
                    )}
                    <p className="font-mono">Phone: {printingOrder.contactPhone}</p>
                  </div>
                  <div className="space-y-1.5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="font-bold text-slate-905 uppercase text-[10px] tracking-wider font-mono">Dispatched Via (Fulfillment Hub):</p>
                    <p className="font-bold text-slate-805 text-sm">{matchedBranch?.city} Logistics Hub</p>
                    <p className="text-slate-600">Branch Identity: {matchedBranch?.name}</p>
                    <p className="font-mono">Contact Helpline: {matchedBranch?.contactPhone}</p>
                  </div>
                </div>

                {/* Ledger Listing Table */}
                <div className="space-y-2">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-205 text-[10px] font-bold tracking-wider text-slate-400 font-mono uppercase bg-slate-100/60">
                        <th className="py-2.5 px-3">Device Component Description</th>
                        <th className="py-2.5 px-3 text-center">SKU Code</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right font-bold font-sans">Aggregate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {printingOrder.items.map((it, idx) => {
                        const hasItDisc = it.appliedDiscountRate && it.appliedDiscountRate > 0;
                        const finalItPrice = hasItDisc ? (it.price * (1 - it.appliedDiscountRate / 100)) : it.price;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/20">
                            <td className="py-3 px-3 font-medium text-slate-900">
                              <div>{it.productName}</div>
                              {hasItDisc && (
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded inline-block mt-1 font-mono tracking-wide border ${
                                  it.isProductSpecific 
                                    ? 'bg-emerald-55/10 border-emerald-200 text-[#166534]' 
                                    : 'bg-indigo-55/10 border-indigo-200 text-indigo-850'
                                }`}>
                                  {it.isProductSpecific ? '🎁 Product-Specific Offer' : '🏥 Hospital Partner Rate'} ({it.appliedDiscountRate}% Off)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 tracking-wider text-center font-mono text-[11px] text-slate-500">{it.sku}</td>
                            <td className="py-3 px-3 font-mono text-right">
                              {hasItDisc ? (
                                <>
                                  <div className="line-through text-slate-400 text-[10px]">₹{it.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                  <div className="text-[#166534] font-bold">₹{finalItPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                </>
                              ) : (
                                <span>₹{it.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-center">{it.quantity}</td>
                            <td className="py-3 px-3 font-mono font-bold text-right text-slate-905">
                              ₹{(finalItPrice * it.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom line Receipts break-downs */}
                <div className="border-t border-slate-200 pt-4 flex justify-between items-start">
                  <div className="max-w-xs text-[11px] text-slate-500 space-y-1.5 mt-1">
                    <p className="font-bold text-slate-700">Payment Reconciliation Details</p>
                    <div className="space-y-1 font-mono text-[10px] bg-slate-50 p-2.5 rounded-lg border">
                      <p>Payment Status: <span className="font-bold uppercase text-indigo-700">{printingOrder.paymentStatus || 'pending'}</span></p>
                      <p>Advance Received: ₹{(printingOrder.advancePayment || 0).toLocaleString('en-IN')}</p>
                      <p>Lump-Sum Paid: ₹{(printingOrder.lumpSumPayment || 0).toLocaleString('en-IN')}</p>
                      <p className="font-bold text-slate-800 border-t pt-1 mt-1">Ledger Balance: ₹{(printingOrder.outstandingBalance !== undefined ? printingOrder.outstandingBalance : Math.max(0, finalVal - ((printingOrder.advancePayment || 0) + (printingOrder.lumpSumPayment || 0)))).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="w-68 space-y-2 text-xs">
                    <div className="flex justify-between items-baseline text-slate-500">
                      <span>Gross Ledger Subtotal:</span>
                      <span className="font-mono">₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {discAmt > 0 && (
                      <div className="flex justify-between items-baseline text-[#166534] font-semibold bg-[#DCFCE7]/40 px-2 py-0.5 rounded border border-[#BBF7D0]">
                        <span>Applied Ledger Discounts:</span>
                        <span className="font-mono font-black">-₹{discAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline border-t border-slate-205 pt-2 text-slate-905 animate-fadeIn">
                      <span className="font-bold text-sm text-slate-800 font-sans">Final Settled Total:</span>
                      <span className="font-mono text-base font-black text-indigo-700 font-mono">₹{finalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Footer signatures */}
                <div className="grid grid-cols-2 pt-12 text-center text-[10px] text-slate-400 font-medium">
                  <div>
                    <div className="mx-auto w-32 border-b border-slate-205 mb-1 h-8"></div>
                    <p>Consigned Dispatch Officer</p>
                  </div>
                  <div>
                    <div className="mx-auto w-32 border-b border-slate-205 mb-1 h-8"></div>
                    <p>Hospital Wing Stamp & Sign</p>
                  </div>
                </div>

              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
