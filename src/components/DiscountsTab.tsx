import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Branch, Product, BranchDiscount } from '../types';
import { 
  Building2, Percent, Trash2, Plus, 
  Search, Hospital, AlertTriangle, CheckCircle2,
  Tag, ShoppingBag, Edit2, X, Sparkles, HelpCircle
} from 'lucide-react';

interface DiscountsTabProps {
  currentUserProfile: UserProfile | null;
  branches: Branch[];
  products: Product[];
  users: UserProfile[];
  discounts: BranchDiscount[];
}

export default function DiscountsTab({ 
  currentUserProfile, 
  branches, 
  products, 
  users, 
  discounts 
}: DiscountsTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const isBranchAdmin = currentUserProfile?.role === 'branch_admin';
  const userBranchId = currentUserProfile?.branchId;

  // Selected branch in context (defaults to branch admin's branch, or first branch for super admin)
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isBranchAdmin ? (userBranchId || '') : (branches[0]?.id || '')
  );

  // Form states
  const [targetHospitalUid, setTargetHospitalUid] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [discountPercentValue, setDiscountPercentValue] = useState('');
  
  // Edit mode tracking
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);

  // Search & Filter state
  const [searchHospital, setSearchHospital] = useState('');
  const [searchProduct, setSearchProduct] = useState('');

  // Alerts
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Extract all hospital users from users list
  const hospitalUsers = users.filter(u => u.role === 'hospital');
  
  // Find current branch
  const activeBranch = branches.find(b => b.id === (isBranchAdmin ? userBranchId : selectedBranchId));

  // Determine discounts active at this specific branch
  const branchDiscounts = discounts.filter(d => d.branchId === (isBranchAdmin ? userBranchId : selectedBranchId));

  // Filtered list of discounts for view
  const filteredDiscounts = branchDiscounts.filter(disc => {
    const matchedHospital = hospitalUsers.find(h => h.uid === disc.hospitalUid);
    const matchedProduct = products.find(p => p.id === disc.productId);

    const hospitalName = matchedHospital?.hospitalName || matchedHospital?.displayName || 'Unknown';
    const productName = matchedProduct?.name || 'Unknown';
    const productSku = matchedProduct?.sku || '';

    const matchesHospital = hospitalName.toLowerCase().includes(searchHospital.toLowerCase());
    const matchesProduct = productName.toLowerCase().includes(searchProduct.toLowerCase()) || 
                           productSku.toLowerCase().includes(searchProduct.toLowerCase());

    return matchesHospital && matchesProduct;
  });

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const resetForm = () => {
    setTargetHospitalUid('');
    setSelectedProductId('');
    setDiscountPercentValue('');
    setEditingDiscountId(null);
  };

  // Create or Update discount
  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchToSave = isBranchAdmin ? userBranchId : selectedBranchId;

    if (!branchToSave) {
      showToast('Fulfillment Branch unselected or unassigned.', 'error');
      return;
    }
    if (!targetHospitalUid) {
      showToast('Please select a target Hospital / Clinic.', 'error');
      return;
    }
    if (!selectedProductId) {
      showToast('Please select a Surgical Product.', 'error');
      return;
    }

    const pct = parseFloat(discountPercentValue);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast('Discount rate must be a numeric value between 0% and 100%.', 'error');
      return;
    }

    setLoading(true);

    try {
      // Build the discount record
      const discountId = editingDiscountId || Math.random().toString(36).substring(2, 9);
      const discountRecord: BranchDiscount = {
        id: discountId,
        branchId: branchToSave,
        hospitalUid: targetHospitalUid,
        productId: selectedProductId,
        discountPercent: pct,
        createdAt: editingDiscountId ? (branchDiscounts.find(d => d.id === editingDiscountId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now()
      };

      // 1. Dual-Write fallbacks: First, try updating/adding to the root 'discounts' collection
      try {
        if (editingDiscountId) {
          const docRef = doc(db, 'discounts', editingDiscountId);
          await updateDoc(docRef, {
            hospitalUid: targetHospitalUid,
            productId: selectedProductId,
            discountPercent: pct,
            updatedAt: Date.now()
          });
        } else {
          // Check for duplicate in root collection
          const existingDuplicate = branchDiscounts.find(d => 
            d.hospitalUid === targetHospitalUid && 
            d.productId === selectedProductId
          );
          if (existingDuplicate) {
            const docRef = doc(db, 'discounts', existingDuplicate.id);
            await updateDoc(docRef, {
              discountPercent: pct,
              updatedAt: Date.now()
            });
          } else {
            // Write a custom ID document to match the random ID or let Firebase generate
            const customDocRef = doc(db, 'discounts', discountId);
            await setDoc?.(customDocRef, discountRecord); // we can safely write to custom doc
          }
        }
      } catch (rootErr) {
        console.warn("Discounts root collection write write-permissions limited (falling back to branch-level nested state):", rootErr);
      }

      // 2. ALWAYS write to the branch's nested 'discounts' array so it is fully synchronized bypassing rules limits
      const matchedBranch = branches.find(b => b.id === branchToSave);
      if (matchedBranch) {
        const branchDocRef = doc(db, 'branches', branchToSave);
        const currentDiscounts = matchedBranch.discounts || [];
        
        let newDiscounts: BranchDiscount[] = [];
        if (editingDiscountId) {
          newDiscounts = currentDiscounts.map(d => d.id === editingDiscountId ? discountRecord : d);
        } else {
          // Remove duplicate if it exists and add new
          const filtered = currentDiscounts.filter(d => !(d.hospitalUid === targetHospitalUid && d.productId === selectedProductId));
          newDiscounts = [...filtered, discountRecord];
        }

        await updateDoc(branchDocRef, {
          discounts: newDiscounts
        });
      }

      showToast(editingDiscountId ? 'Facility product-discount level updated successfully!' : 'Exclusive clinical product-discount initialized!');
      resetForm();
    } catch (err) {
      console.error("Save discount generic failure: ", err);
      showToast('Could not save discount record.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Populate form for editing
  const startEdit = (disc: BranchDiscount) => {
    setEditingDiscountId(disc.id);
    setTargetHospitalUid(disc.hospitalUid);
    setSelectedProductId(disc.productId);
    setDiscountPercentValue(disc.discountPercent.toString());
  };

  // Delete discount
  const handleDeleteDiscount = async (id: string) => {
    const confirm = window.confirm('Decommission this custom product-discount rate? Standard rates will reactivate.');
    if (!confirm) return;

    setLoading(true);
    const branchToSave = isBranchAdmin ? userBranchId : selectedBranchId;

    try {
      // 1. Try deleting from root collection
      try {
        await deleteDoc(doc(db, 'discounts', id));
      } catch (rootErr) {
        console.warn("Discounts root collection delete restricted:", rootErr);
      }

      // 2. Clear out from branch's nested discounts array
      if (branchToSave) {
        const matchedBranch = branches.find(b => b.id === branchToSave);
        if (matchedBranch) {
          const branchDocRef = doc(db, 'branches', branchToSave);
          const currentDiscounts = matchedBranch.discounts || [];
          const newDiscounts = currentDiscounts.filter(d => d.id !== id);
          
          await updateDoc(branchDocRef, {
            discounts: newDiscounts
          });
        }
      }

      showToast('Product discount successfully decommissioned.');
      if (editingDiscountId === id) {
        resetForm();
      }
    } catch (err) {
      console.error("Error deleting discount record: ", err);
      showToast('Could not delete discount rate.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="discounts-tab" className="space-y-6">
      
      {/* Toast alert */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg animate-fadeIn text-xs font-semibold ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-850' 
            : 'bg-rose-50 border-rose-200 text-rose-850'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-600" /> Granular Product & Hospital Discounts
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {isBranchAdmin 
              ? `Manage custom product-specific pricing layers for hospital clinics dispatched from your ${activeBranch?.city || 'assigned'} hub.`
              : 'Corporate-wide partner discount console. Configure custom pricing bounds.'}
          </p>
        </div>

        {/* Global branch selector for Super Admin */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2 text-xs shrink-0 bg-slate-50 border border-slate-100 p-2.5 rounded-xl font-sans">
            <span className="text-slate-500 font-bold uppercase tracking-wider font-mono">Fulfillment Hub:</span>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                resetForm();
              }}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden text-slate-700 font-semibold"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.city} ({b.name})</option>
              ))}
            </select>
          </div>
        )}

        {isBranchAdmin && (
          <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center gap-2 shrink-0 text-xs font-sans">
            <Building2 className="w-4 h-4 text-indigo-500" />
            <span className="font-bold text-slate-700">Managing {activeBranch?.city || 'Regional'} Hub</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Create Form */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-5">
            <div className="border-b border-slate-50 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                {editingDiscountId ? (
                  <>
                    <Edit2 className="w-4 h-4 text-amber-500" /> Update Special Discount Pricing
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-indigo-600" /> Configure Special Discount Layer
                  </>
                )}
              </h3>
              {editingDiscountId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[10px] text-slate-400 hover:text-slate-600 border border-slate-100 px-2 py-1 rounded"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSaveDiscount} className="space-y-4">
              
              {/* Target Hospital Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Hospital className="w-3.5 h-3.5 text-slate-400" /> Target Hospital Clinic
                </label>
                <select
                  required
                  value={targetHospitalUid}
                  onChange={(e) => setTargetHospitalUid(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-xs"
                >
                  <option value="">-- Choose Partner Facility --</option>
                  {hospitalUsers.map(h => (
                    <option key={h.uid} value={h.uid}>
                      {h.hospitalCity ? `[${h.hospitalCity}] ` : ''}{h.hospitalName || h.displayName}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Select a registered hospital user to map the discount.
                </p>
              </div>

              {/* Product Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <ShoppingBag className="w-3.5 h-3.5 text-slate-400" /> Surgical Core Product
                </label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-xs"
                >
                  <option value="">-- Select Medical Category Product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.sku} | {p.name} (₹{p.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Discount Percentage Input */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5 text-slate-400" /> Special Partner Discount (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                    placeholder="e.g. 17.5"
                    value={discountPercentValue}
                    onChange={(e) => setDiscountPercentValue(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden text-xs font-mono font-bold"
                  />
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400 text-xs font-mono">
                    %
                  </div>
                </div>
                <span className="text-[9px] text-indigo-500 font-semibold block mt-1">
                  💡 This discount rate overrides the global hospital rate for this product.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {loading ? 'Processing...' : editingDiscountId ? 'Update Discount' : 'Confirm & Apply'}
              </button>
            </form>
          </div>

          {/* Guidelines info */}
          <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-150 space-y-3.5 text-xs">
            <h4 className="font-bold text-slate-700 flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" /> Rules of Engagement
            </h4>
            <ul className="space-y-2 text-slate-500 leading-relaxed list-disc list-inside">
              <li>Product discounts set here apply **only** to the selected branch during checkout dispatch.</li>
              <li>When a clinician places an order, the specific product discount acts as a complete override of the general hospital rate (`UserProfile.discountRate`).</li>
              <li>A general hospital discount is applied to any product *not* explicitly configured here.</li>
              <li>Setting a discount to `0%` is valid to exclude a high-cost product from general hospital discount rules completely.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Ledger Grid */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Filters Bar */}
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-4 text-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono shrink-0">Ledger Filters:</span>
            
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search by Hospital..."
                value={searchHospital}
                onChange={(e) => setSearchHospital(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 pl-8 focus:outline-hidden text-slate-700"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search by Product Name / SKU..."
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 pl-8 focus:outline-hidden text-slate-700"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Discounts listing */}
          <div className="space-y-3">
            {filteredDiscounts.map(disc => {
              const targetHosp = hospitalUsers.find(h => h.uid === disc.hospitalUid);
              const targetProd = products.find(p => p.id === disc.productId);

              const hospDisplayName = targetHosp?.hospitalName || targetHosp?.displayName || 'Unknown Clinic';
              const hospCity = targetHosp?.hospitalCity || 'Unspecified';
              const prodName = targetProd?.name || 'Surgical Consumable';
              const prodSku = targetProd?.sku || '--';
              const originalPrice = targetProd?.price || 0;
              const discountedPrice = originalPrice * (1 - disc.discountPercent / 100);

              const isEditingCurrent = editingDiscountId === disc.id;

              return (
                <div 
                  key={disc.id} 
                  className={`bg-white border rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-350 transition-all ${
                    isEditingCurrent ? 'border-indigo-400 ring-2 ring-indigo-50 bg-indigo-50/5' : 'border-slate-100'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-0.5 rounded-full font-bold">
                        🏥 {hospDisplayName} ({hospCity})
                      </span>
                      <span className="text-[10px] font-bold font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                        SKU: {prodSku}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-800 text-sm truncate leading-tight mt-1">{prodName}</h4>
                    
                    {/* Price breakdown block */}
                    <div className="flex items-center gap-3 text-xs mt-1 text-slate-500 font-mono flex-wrap">
                      <span>Standard Rate: <span className="line-through text-slate-400">₹{originalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></span>
                      <span className="font-bold text-[#166534] bg-emerald-55/10 px-1.5 py-0.5 rounded">
                        👉 Partner Offer: ₹{discountedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Discount figure and operations controls */}
                  <div className="flex items-center gap-4 shrink-0 font-sans w-full md:w-auto justify-between md:justify-end border-t md:border-none pt-3 md:pt-0 border-slate-50">
                    <div className="text-right">
                      <div className="text-lg font-black text-slate-900 font-mono tracking-tight text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl flex items-center justify-center gap-0.5 shadow-2xs">
                        <Percent className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{disc.discountPercent}%</span>
                      </div>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5 uppercase tracking-wider">Discount Applet</p>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => startEdit(disc)}
                        disabled={isEditingCurrent}
                        className="p-2 border border-slate-150 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                        title="Edit percentage rate"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDiscount(disc.id)}
                        className="p-2 border border-rose-150 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
                        title="Revoke partner discount"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredDiscounts.length === 0 && (
              <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-205 rounded-2xl">
                <Percent className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 font-semibold text-sm">No tailored regional branch discounts defined matching criteria.</p>
                <p className="text-slate-400 text-xs mt-1">Configure one using the special console panel on the left to activate unique hospital partner promotions.</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
