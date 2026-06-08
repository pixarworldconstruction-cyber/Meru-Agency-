import React, { useState } from 'react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DeliveryOrder, Branch, UserProfile, Product, DeliveryStatus } from '../types';
import { 
  Truck, CheckCircle, Clock, AlertCircle, ShoppingBag, 
  MapPin, Phone, User, Calendar, RefreshCcw, XCircle, FileText 
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
                <div className="flex items-center gap-2">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'preparing')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      Acknowledge & Prepare
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'shipping')}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      Dispatch / Ship
                    </button>
                  )}
                  {order.status === 'shipping' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'delivered')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      Confirm Delivery
                    </button>
                  )}
                  {order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                      className="border border-rose-250 text-rose-500 hover:bg-rose-50 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>

              {/* Order Specifics */}
              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
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
                    <p className="text-slate-400 text-[10px]">Office Contact: {matchedBranch?.contactPhone}</p>
                  </div>
                </div>

                {/* Items requested and total pricing */}
                <div className="p-5 space-y-3.5 text-xs flex flex-col justify-between">
                  <div>
                    <h5 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] font-mono mb-2">Requested Devices</h5>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-slate-700 bg-slate-50/40 p-1.5 rounded-md">
                          <div>
                            <span className="font-medium">{item.productName}</span>
                            <span className="text-[10px] text-slate-400 font-mono block">SKU: {item.sku}</span>
                          </div>
                          <span className="font-mono font-bold bg-slate-200 text-slate-750 px-2 py-0.5 rounded text-[11px]">
                            {item.quantity}x
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Calculating Order Value */}
                  <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                    <span className="font-semibold text-slate-400">Value of consignment:</span>
                    <span className="font-mono text-base font-bold text-slate-900">
                      ₹{order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
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
    </div>
  );
}
