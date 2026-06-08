import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Branch, UserProfile } from '../types';
import { ShoppingBag, Search, Plus, Edit2, Trash2, Layers, DollarSign, Archive, FileText, Check, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ProductsTabProps {
  currentUserProfile: UserProfile | null;
  products: Product[];
  branches: Branch[];
}

const CATEGORIES = [
  'Sutures & Wound Closure',
  'Surgical Instruments',
  'Anesthesia & Airway',
  'Orthopedic Implants',
  'PPE & Sterilization',
  'Surgical Drapes & Packs',
  'Disposable Consumables'
];

export default function ProductsTab({ currentUserProfile, products, branches }: ProductsTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const isBranchAdmin = currentUserProfile?.role === 'branch_admin';
  const userBranchId = currentUserProfile?.branchId;
  const activeBranch = branches.find(b => b.id === userBranchId);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('All');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [unit, setUnit] = useState('Box');
  const [imageUrl, setImageUrl] = useState('');
  // Object holding branchId -> stock quantity
  const [branchStocks, setBranchStocks] = useState<{ [branchId: string]: number }>({});

  // Trigger form opening for adding
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setSku('');
    setCategory(CATEGORIES[0]);
    setDescription('');
    setPrice(0);
    setUnit('Box');
    setImageUrl('');
    
    // Initialize stocks
    const initialStocks: { [branchId: string]: number } = {};
    branches.forEach(b => {
      initialStocks[b.id] = 0;
    });
    setBranchStocks(initialStocks);
    setShowAddForm(true);
  };

  // Trigger form opening for editing
  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setSku(product.sku);
    setCategory(product.category);
    setDescription(product.description);
    setPrice(product.price);
    setUnit(product.unit);
    setImageUrl(product.imageUrl || '');
    
    // Merge existing branch stocks with any newly added branches that have 0
    const mergedStocks: { [branchId: string]: number } = {};
    branches.forEach(b => {
      mergedStocks[b.id] = product.stock?.[b.id] || 0;
    });
    setBranchStocks(mergedStocks);
    setShowAddForm(true);
  };

  // Stock update specific to a branch admin (fast edit directly in inventory)
  const [quickStockEditProductId, setQuickStockEditProductId] = useState<string | null>(null);
  const [quickStockValue, setQuickStockValue] = useState<number>(0);

  const handleSaveQuickStock = async (product: Product) => {
    if (!userBranchId) return;
    const path = `products/${product.id}`;
    try {
      const updatedStockMap = {
        ...(product.stock || {}),
        [userBranchId]: Number(quickStockValue)
      };
      await updateDoc(doc(db, 'products', product.id), {
        stock: updatedStockMap
      });
      setQuickStockEditProductId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Submit full form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim() || !category || !description.trim() || price <= 0) {
      alert('Please fill out all required fields with accurate information.');
      return;
    }

    const path = 'products';
    try {
      // Validate that stock values are numbers
      const sanitizedStocks: { [branchId: string]: number } = {};
      branches.forEach(b => {
        sanitizedStocks[b.id] = Number(branchStocks[b.id] || 0);
      });

      if (editingProduct) {
        // Super admins can update metadata + stocks. 
        // Branch admins can ONLY update their specific branch's stocks, but we'll adapt depending on layout permissions.
        const productRef = doc(db, path, editingProduct.id);
        const updatePayload: any = {
          name: name.trim(),
          sku: sku.trim(),
          category,
          description: description.trim(),
          price: Number(price),
          unit,
          imageUrl: imageUrl.trim(),
        };

        if (isSuperAdmin) {
          updatePayload.stock = sanitizedStocks;
        } else if (isBranchAdmin && userBranchId) {
          // Keep other stocks, only update userBranchId
          const merged = { ...(editingProduct.stock || {}) };
          merged[userBranchId] = Number(branchStocks[userBranchId] || 0);
          updatePayload.stock = merged;
        }

        await updateDoc(productRef, updatePayload);
      } else {
        // Add new product
        if (!isSuperAdmin) {
          alert('Unauthorized: Only Super Administrators can introduce new items into circulation.');
          return;
        }
        await addDoc(collection(db, path), {
          name: name.trim(),
          sku: sku.trim(),
          category,
          description: description.trim(),
          price: Number(price),
          unit,
          imageUrl: imageUrl.trim(),
          stock: sanitizedStocks,
          createdAt: Date.now()
        });
      }

      setShowAddForm(false);
      setEditingProduct(null);
    } catch (err) {
      handleFirestoreError(err, editingProduct ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!isSuperAdmin) {
      alert('Only Super Admins can decommission hardware items/supplies.');
      return;
    }
    if (!window.confirm('Decomissioning this hardware list item? This will remove catalog reference.')) return;
    const path = `products/${productId}`;
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Stock input handlers
  const handleStockChange = (branchId: string, val: string) => {
    setBranchStocks(prev => ({
      ...prev,
      [branchId]: Math.max(0, parseInt(val, 10) || 0)
    }));
  };

  // Filters logic
  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    
    // If branch admin, filter to view catalog.
    // If super admin and specific branch filter is set
    let matchesBranch = true;
    if (isBranchAdmin && userBranchId) {
      // Branch admins are restricted to view items status in their branch, but we show whole catalog and show stock level there.
    } else if (isSuperAdmin && selectedBranchFilter !== 'All') {
      // Just showing items that have a positive stock in designated branch, or standard stock list
    }

    return matchesSearch && matchesCategory;
  });

  return (
    <div id="products-tab" className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Operational Supply Catalog</h2>
          <p className="text-slate-500 text-sm mt-1">
            {isBranchAdmin 
              ? `Authorized managing items for city: ${activeBranch?.city || 'No branch assigned'} (${activeBranch?.name})` 
              : 'Super Administration dashboard for medical devices, implants, and sutures'}
          </p>
        </div>
        
        {isSuperAdmin && (
          <button
            id="add-product-btn"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-[#3B82F6] text-white hover:bg-[#2563EB] px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" /> Introduce Product
          </button>
        )}
      </div>

      {/* Main product entry / modification form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200/60 p-6 rounded-2xl space-y-6 animate-fadeIn">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              {editingProduct ? `Edit Asset: ${editingProduct.name}` : 'Deploy New Sterile Supply Catalogue'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Fill in product specs to deliver to healthcare clinics.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Left columns: Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:col-span-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Product Description Label</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sterile Ultra Silk Suture 4-0"
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">SKU Code</label>
                <input
                  type="text"
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g. MED-729-XSL"
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Specialty Classification</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
                >
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Standard Price (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price || ''}
                    onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="e.g. 129.50"
                    className="w-full pl-7 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Unit of Measurement (UOM)</label>
                <input
                  type="text"
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. Box of 12, Case, Box, Tray"
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Asset Image URL (Optional)</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Technical Specs & Notes</label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Operating room specifications, chemical composition details, sterilizing standards..."
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900/10 text-sm h-24 resize-none"
                />
              </div>
            </div>

            {/* Right column: Multi-branch Stock levels */}
            <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-4">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                <Archive className="w-4 h-4 text-slate-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Stock per Hub/City</h4>
              </div>

              {branches.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Create a physical branch office first to track operational inventory.
                </div>
              ) : (
                <div className="space-y-3.5 max-h-76 overflow-y-auto pr-1">
                  {branches.map(b => {
                    const hasAccess = isSuperAdmin || (isBranchAdmin && b.id === userBranchId);
                    return (
                      <div key={b.id} className={`flex items-center justify-between p-2 rounded-lg ${hasAccess ? 'bg-slate-50' : 'bg-slate-50/40 opacity-70'}`}>
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-slate-700 truncate">{b.name}</p>
                          <p className="text-[10px] text-slate-400 tracking-wide uppercase font-medium mt-0.5">{b.city}</p>
                        </div>
                        <div className="w-24 shrink-0">
                          <input
                            type="number"
                            min="0"
                            disabled={!hasAccess}
                            value={branchStocks[b.id] !== undefined ? branchStocks[b.id] : 0}
                            onChange={(e) => handleStockChange(b.id, e.target.value)}
                            className="w-full text-right px-2.5 py-1 text-xs border border-slate-200 bg-white rounded-lg focus:outline-hidden focus:border-slate-800 font-mono disabled:bg-slate-100/50"
                            placeholder="Qty"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/50">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-sm font-medium transition-colors"
            >
              {editingProduct ? 'Commit Updates' : 'Add Item to Inventory'}
            </button>
          </div>
        </form>
      )}

      {/* Filter and search parameters */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search items by SKU, generic formula, description..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm font-sans shadow-xs focus:outline-hidden focus:ring-2 focus:ring-slate-900/5 transition-all text-slate-800"
          />
        </div>

        {/* Category filtering */}
        <div className="flex gap-2.5 overflow-x-auto pb-1 shrink-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap ${selectedCategory === 'All' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            All Specialties
          </button>
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap ${selectedCategory === category ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Product List/Grid */}
      <div className="bg-white border border-slate-100 shadow-xs rounded-2xl overflow-hidden">
        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono">
            Catalog Items ({filteredProducts.length})
          </span>
          {isBranchAdmin && activeBranch && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <ShieldCheck className="w-3.5 h-3.5" /> Filtering for Admin Control Hub: {activeBranch.city}
            </div>
          )}
        </div>

        <table className="w-full text-left border-collapse table-fixed lg:table-auto">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-bold tracking-wider text-slate-400 bg-slate-50/30 uppercase">
              <th className="px-6 py-4 w-1/3">Item Details</th>
              <th className="px-6 py-4 w-1/6">SKU / Code</th>
              <th className="px-6 py-4 w-1/6">Price / Unit</th>
              <th className="px-6 py-4 w-1/4">Stock Per Branch</th>
              <th className="px-6 py-4 text-right w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredProducts.map(product => {
              // Calculate specific stocks
              const totalStock = Object.values(product.stock || {}).reduce((a, b) => a + b, 0);
              
              // Get current branch's stock in context
              const currentHubStock = userBranchId ? (product.stock?.[userBranchId] || 0) : null;
              
              return (
                <tr key={product.id} className="hover:bg-slate-50/45 transition-colors group">
                  <td className="px-6 py-4 text-sm font-sans max-w-xs">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                        {product.imageUrl ? (
                          <img 
                            src={product.imageUrl} 
                            alt={product.name} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold bg-slate-950/5">
                            Rx
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold tracking-wider text-[#3B82F6] bg-[#3B82F6]/10 px-2 py-0.5 rounded-md inline-block uppercase font-mono">
                          {product.category}
                        </p>
                        <h4 className="font-bold text-[#0F172A] leading-tight mt-1.5 truncate text-sm">{product.name}</h4>
                        <p className="text-slate-500 text-xs truncate mt-0.5">{product.description}</p>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200/50">
                      {product.sku}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                    <div className="font-mono text-slate-800">${product.price.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-400 font-medium">per {product.unit}</div>
                  </td>

                  <td className="px-6 py-4 text-xs text-slate-600">
                    {/* Multi branch display */}
                    <div className="space-y-1 max-w-72">
                      {isBranchAdmin && userBranchId && activeBranch ? (
                        <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-1">
                          <span className="font-medium text-slate-700">{activeBranch.city} Hub:</span>
                          {quickStockEditProductId === product.id ? (
                            <div className="flex items-center gap-1 font-mono">
                              <input
                                type="number"
                                min="0"
                                value={quickStockValue}
                                onChange={(e) => setQuickStockValue(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-16 px-1.5 py-0.5 bg-white border border-slate-300 rounded text-center text-xs font-mono font-bold"
                              />
                              <button
                                onClick={() => handleSaveQuickStock(product)}
                                className="bg-emerald-600 text-white p-1 rounded hover:bg-emerald-700"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono font-bold ${currentHubStock && currentHubStock > 10 ? 'text-slate-900' : currentHubStock && currentHubStock > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {currentHubStock || 0}
                              </span>
                              <button
                                onClick={() => {
                                  setQuickStockValue(currentHubStock || 0);
                                  setQuickStockEditProductId(product.id);
                                }}
                                className="text-slate-400 hover:text-slate-800 font-semibold text-[10px] underline"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          {branches.slice(0, 3).map(b => {
                            const bStock = product.stock?.[b.id] || 0;
                            return (
                              <div key={b.id} className="flex justify-between border-r border-slate-100 pr-2">
                                <span className="text-slate-400 truncate">{b.city}:</span>
                                <span className={`font-mono font-bold ${bStock > 5 ? 'text-slate-700' : bStock > 0 ? 'text-amber-500' : 'text-rose-450'}`}>{bStock}</span>
                              </div>
                            );
                          })}
                          {branches.length > 3 && (
                            <div className="text-[10px] text-slate-400 italic col-span-2">
                              + {branches.length - 3} other branch hubs
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="text-[10px] text-slate-500 font-semibold bg-slate-50 px-2 py-0.5 rounded-sm inline-block">
                        Total Stock: <span className="font-mono text-slate-800">{totalStock} units</span>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="opacity-70 group-hover:opacity-100 flex items-center justify-end gap-1.5 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(product)}
                        className="p-1 px-2.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg flex items-center gap-1 border border-slate-200 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Modify
                      </button>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(product.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                  <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No medical supply items found matching search filters.
                  {isSuperAdmin && (
                    <button onClick={handleOpenAdd} className="text-indigo-600 font-bold block mx-auto mt-2 hover:underline">
                      Add first product item
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
