import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Branch, UserProfile } from '../types';
import { 
  ShoppingBag, Search, Plus, Minus, ShoppingCart, 
  MapPin, Phone, Building2, Calendar, FileText, Check, Landmark 
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
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // Delivery destination states
  const [hospitalName, setHospitalName] = useState(currentUserProfile?.hospitalName || '');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [orderComplete, setOrderComplete] = useState(false);
  const [lastOrderId, setLastOrderId] = useState('');

  const selectedBranch = branches.find(b => b.id === selectedBranchId);

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
        updatedAt: Date.now()
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

  return (
    <div id="hospital-view" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Catalog & selection */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* Hub Selector */}
        <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-800">
            <Building2 className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-bold">1. Select Your Nearest Regional Supply Hub</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {branches.map(branch => (
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

            {branches.length === 0 && (
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
          {cart.length > 0 && (
            <div className="border-t border-slate-100 pt-3 flex justify-between items-baseline">
              <span className="text-xs text-slate-500">Subtotal value:</span>
              <span className="font-mono text-base font-extrabold text-slate-900">₹{getTotalPrice().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}

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
  );
}
