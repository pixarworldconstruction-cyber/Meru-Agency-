import React, { useState } from 'react';
import { DeliveryOrder, Branch, Product, UserProfile } from '../types';
import { 
  Calendar, TrendingUp, ChevronRight, DollarSign, 
  ShoppingBag, Award, Tag, Box, ArrowRight, Clock, MapPin 
} from 'lucide-react';

interface AnalyticsTabProps {
  currentUserProfile: UserProfile | null;
  deliveries: DeliveryOrder[];
  branches: Branch[];
  products: Product[];
}

type DurationType = '7days' | '30days' | 'mtd' | 'ytd' | 'custom';

export default function AnalyticsTab({ currentUserProfile, deliveries, branches, products }: AnalyticsTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const isBranchAdmin = currentUserProfile?.role === 'branch_admin';
  const userBranchId = currentUserProfile?.branchId;

  const [durationType, setDurationType] = useState<DurationType>('30days');
  const [selectedBranch, setSelectedBranch] = useState<string>(
    isBranchAdmin ? (userBranchId || 'All') : 'All'
  );

  // Custom date ranges
  const [startDateStr, setStartDateStr] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDateStr, setEndDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Active chart tooltip state
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number; count: number } | null>(null);

  // 1. Compute cutoff timestamps based on selection
  const now = new Date();
  let startTimestamp = 0;
  let endTimestamp = Date.now();

  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  if (durationType === '7days') {
    startTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
  } else if (durationType === '30days') {
    startTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000;
  } else if (durationType === 'mtd') {
    startTimestamp = mtdStart.getTime();
  } else if (durationType === 'ytd') {
    startTimestamp = ytdStart.getTime();
  } else if (durationType === 'custom') {
    startTimestamp = new Date(startDateStr + 'T00:00:00').getTime();
    endTimestamp = new Date(endDateStr + 'T23:59:59').getTime();
  }

  // 2. Filter orders using the timeframe & branch restrictions
  const filteredOrders = deliveries.filter(order => {
    // Time constraint
    if (order.createdAt < startTimestamp || order.createdAt > endTimestamp) return false;
    
    // Defer cancelled requests for pure analytics
    if (order.status === 'cancelled') return false;

    // Branch context
    if (isBranchAdmin && userBranchId) {
      if (order.branchId !== userBranchId) return false;
    } else {
      if (selectedBranch !== 'All' && order.branchId !== selectedBranch) return false;
    }

    return true;
  });

  // Calculate high-level bento indicators
  let grossSubtotal = 0;
  let totalDiscounts = 0;
  let netSalesPrice = 0;
  let totalUnitsDispatched = 0;

  filteredOrders.forEach(order => {
    // Calculate subtotal
    const sub = order.items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    grossSubtotal += sub;

    // Calculate applied discounts
    const savedDiscount = order.discountAmount || 0;
    totalDiscounts += savedDiscount;

    // Calculate net sales price
    if (order.finalTotal !== undefined) {
      netSalesPrice += order.finalTotal;
    } else {
      netSalesPrice += (sub - savedDiscount);
    }

    // Accumulate supply units
    const units = order.items.reduce((acc, it) => acc + it.quantity, 0);
    totalUnitsDispatched += units;
  });

  // 3. Category distribution analysis
  const categoryChartData: { [cat: string]: number } = {};
  filteredOrders.forEach(order => {
    order.items.forEach(it => {
      // Find matches in products to retrieve category
      const p = products.find(prod => prod.id === it.productId);
      const cat = p?.category || 'Consumable / Diagnostics';
      categoryChartData[cat] = (categoryChartData[cat] || 0) + it.quantity;
    });
  });

  const sortedCategories = Object.entries(categoryChartData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // 4. Client spending leaderboard
  const hospitalLeaderboard: { 
    [uid: string]: { name: string; spend: number; ordersCount: number; saved: number } 
  } = {};

  filteredOrders.forEach(order => {
    const uid = order.hospitalUid || order.hospitalName;
    const sub = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const disc = order.discountAmount || 0;
    const orderTotal = order.finalTotal !== undefined ? order.finalTotal : (sub - disc);

    if (!hospitalLeaderboard[uid]) {
      hospitalLeaderboard[uid] = {
        name: order.hospitalName,
        spend: 0,
        ordersCount: 0,
        saved: 0
      };
    }
    hospitalLeaderboard[uid].spend += orderTotal;
    hospitalLeaderboard[uid].ordersCount += 1;
    hospitalLeaderboard[uid].saved += disc;
  });

  const topHospitals = Object.values(hospitalLeaderboard)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  // 5. Build timeline metrics grouped by Date
  // If YTD, group by month. Otherwise group by day.
  const timelineData: { [key: string]: { label: string; value: number; count: number } } = {};

  const getTimelineKeyAndLabel = (timestamp: number) => {
    const d = new Date(timestamp);
    if (durationType === 'ytd') {
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-IN', { month: 'short' });
      return { key: monthKey, label: monthLabel };
    } else {
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      return { key: dateKey, label: dateLabel };
    }
  };

  // Pre-populate timeline range to show continuity
  const fillTimelineGaps = () => {
    if (durationType === '7days') {
      for (let i = 6; i >= 0; i--) {
        const tempTs = Date.now() - i * 24 * 60 * 60 * 1000;
        const { key, label } = getTimelineKeyAndLabel(tempTs);
        timelineData[key] = { label, value: 0, count: 0 };
      }
    } else if (durationType === '30days') {
      for (let i = 29; i >= 0; i -= 3) {
        const tempTs = Date.now() - i * 24 * 60 * 60 * 1000;
        const { key, label } = getTimelineKeyAndLabel(tempTs);
        timelineData[key] = { label, value: 0, count: 0 };
      }
    } else if (durationType === 'ytd') {
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), i, 15);
        if (d.getTime() <= Date.now()) {
          const { key, label } = getTimelineKeyAndLabel(d.getTime());
          timelineData[key] = { label, value: 0, count: 0 };
        }
      }
    }
  };

  fillTimelineGaps();

  // Populate data points
  filteredOrders.forEach(order => {
    const { key, label } = getTimelineKeyAndLabel(order.createdAt);
    const sub = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const disc = order.discountAmount || 0;
    const finalAmount = order.finalTotal !== undefined ? order.finalTotal : (sub - disc);

    if (!timelineData[key]) {
      timelineData[key] = { label, value: 0, count: 0 };
    }
    timelineData[key].value += finalAmount;
    timelineData[key].count += 1;
  });

  const sortedTimeline = Object.entries(timelineData)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([_, details]) => details);

  // SVG Chart Dimensions & Computations
  const chartHeight = 220;
  const chartWidth = 560;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 30;

  const maxVal = Math.max(...sortedTimeline.map(point => point.value), 25000);

  // Generate coordinates for SVG polyline rendering
  const pointCoords = sortedTimeline.map((point, index) => {
    const x = paddingLeft + (index / Math.max(1, sortedTimeline.length - 1)) * (chartWidth - paddingLeft - paddingRight);
    // Y coordinate (SVG 0 is at top)
    const yMultiplier = maxVal > 0 ? point.value / maxVal : 0;
    const y = chartHeight - paddingBottom - yMultiplier * (chartHeight - paddingTop - paddingBottom);
    return { x, y, point };
  });

  const polylinePointsString = pointCoords.map(pt => `${pt.x},${pt.y}`).join(' ');
  const areaPointsString = pointCoords.length > 0 
    ? `${pointCoords[0].x},${chartHeight - paddingBottom} ` + polylinePointsString + ` ${pointCoords[pointCoords.length - 1].x},${chartHeight - paddingBottom}`
    : '';

  return (
    <div id="analytics-tab" className="space-y-6">
      
      {/* Search Filter Controls header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-800">Operational Intelligence & Data Analytics</h2>
          <p className="text-slate-500 text-sm">Review financial yields, partner discounts issued, and hub dispatch telemetry</p>
        </div>

        {/* Dynamic Period Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 border border-slate-200">
            <button
              onClick={() => setDurationType('7days')}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${durationType === '7days' ? 'bg-white text-indigo-750 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              7 Days
            </button>
            <button
              onClick={() => setDurationType('30days')}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${durationType === '30days' ? 'bg-white text-indigo-750 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              30 Days
            </button>
            <button
              onClick={() => setDurationType('mtd')}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${durationType === 'mtd' ? 'bg-white text-indigo-750 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              MTD
            </button>
            <button
              onClick={() => setDurationType('ytd')}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${durationType === 'ytd' ? 'bg-white text-indigo-750 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              YTD
            </button>
            <button
              onClick={() => setDurationType('custom')}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${durationType === 'custom' ? 'bg-white text-indigo-750 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Custom Range
            </button>
          </div>

          {/* Super admin branch selector */}
          {isSuperAdmin && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-505 focus:outline-hidden text-slate-800 font-semibold"
            >
              <option value="All">All Branches Consolidated</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.city} Office ({b.name})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Custom Date Parameters */}
      {durationType === 'custom' && (
        <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl flex flex-wrap gap-4 items-center animate-fadeIn text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Starting:</span>
            <input
              type="date"
              value={startDateStr}
              onChange={(e) => setStartDateStr(e.target.value)}
              className="bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-hidden"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Ending:</span>
            <input
              type="date"
              value={endDateStr}
              onChange={(e) => setEndDateStr(e.target.value)}
              className="bg-white border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-hidden"
            />
          </div>
          <p className="text-[10px] text-slate-400 italic">Enter calendar parameter boundaries to recalculate index feeds.</p>
        </div>
      )}

      {/* Bento Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Gross yields */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-[#64748B] uppercase font-mono">Gross Subtotal</span>
            <div className="bg-slate-100 p-1 rounded-lg text-slate-500">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl font-bold font-mono text-slate-800">
            ₹{grossSubtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </h3>
          <p className="text-[10px] text-slate-400 leading-none">Catalog aggregate value before discounts</p>
        </div>

        {/* Discounts issued */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-emerald-800 uppercase font-mono">Discounts Granted</span>
            <div className="bg-emerald-50 p-1.5 rounded-lg text-emerald-600 border border-emerald-100">
              <Tag className="w-3.5 h-3.5" />
            </div>
          </div>
          <h3 className="text-xl font-bold font-mono text-emerald-700">
            ₹{totalDiscounts.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </h3>
          <p className="text-[10px] text-emerald-600/80 leading-none">Total hospital partner allowances</p>
        </div>

        {/* Net proceeds */}
        <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-indigo-300 uppercase font-mono">Net Proceeds</span>
            <div className="bg-[#3B82F6]/20 p-1.5 rounded-lg text-[#3B82F6]">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <h3 className="text-xl font-black font-mono text-indigo-150">
            ₹{netSalesPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </h3>
          <p className="text-[10px] text-slate-400 leading-none">Verified final logistics proceeds</p>
        </div>

        {/* Total orders */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-[#64748B] uppercase font-mono">Orders Completed</span>
            <div className="bg-slate-100 p-1 rounded-lg text-slate-500">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl font-extrabold font-mono text-slate-805">
            {filteredOrders.length}
          </h3>
          <p className="text-[10px] text-slate-400 leading-none">Dispatched consignments count</p>
        </div>

        {/* Devices Dispatched */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-widest text-[#64748B] uppercase font-mono">Surgical Units</span>
            <div className="bg-slate-100 p-1 rounded-lg text-slate-500">
              <Box className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl font-extrabold font-mono text-slate-805">
            {totalUnitsDispatched} units
          </h3>
          <p className="text-[10px] text-slate-400 leading-none">Total hardware products processed</p>
        </div>
      </div>

      {/* Main Charts area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Line / Area timeline chart */}
        <div className="bg-white p-5 border border-slate-105 rounded-2xl shadow-xs lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-slate-800">Dispatch Revenue Trend Over Time</h4>
              <p className="text-[10px] text-slate-400 italic">Net realized proceeds charted by calendar milestones</p>
            </div>
            {hoveredPoint && (
              <div className="bg-indigo-50 border border-indigo-100 p-1.5 rounded-lg text-right animate-fadeIn shrink-0">
                <p className="text-[9px] font-black text-indigo-700 leading-tight">{hoveredPoint.label}</p>
                <p className="font-mono text-xs font-bold text-slate-800 leading-none mt-0.5">₹{hoveredPoint.value.toLocaleString('en-IN')}</p>
              </div>
            )}
          </div>

          <div className="relative overflow-hidden flex justify-center">
            {sortedTimeline.length > 0 ? (
              <svg 
                viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                className="w-full max-w-full overflow-hidden"
              >
                {/* Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = paddingTop + ratio * (chartHeight - paddingTop - paddingBottom);
                  const stepVal = maxVal * (1 - ratio);
                  return (
                    <g key={idx}>
                      <line 
                        x1={paddingLeft} 
                        y1={y} 
                        x2={chartWidth - paddingRight} 
                        y2={y} 
                        stroke="#F1F5F9" 
                        strokeWidth="1"
                      />
                      <text 
                        x={paddingLeft - 8} 
                        y={y + 3} 
                        textAnchor="end" 
                        className="fill-slate-400 text-[8px] font-mono leading-none"
                      >
                        ₹{Math.round(stepVal).toLocaleString('en-IN')}
                      </text>
                    </g>
                  );
                })}

                {/* Shaded Area under Curve */}
                {areaPointsString && (
                  <polygon 
                    points={areaPointsString} 
                    className="fill-indigo-600/5 transition-all duration-300"
                  />
                )}

                {/* Main Polyline Curve */}
                {polylinePointsString && (
                  <polyline 
                    points={polylinePointsString} 
                    fill="none" 
                    stroke="#4F46E5" 
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round" 
                    className="transition-all duration-300"
                  />
                )}

                {/* Plot Anchor Interactive Points */}
                {pointCoords.map((pt, idx) => (
                  <circle 
                    key={idx} 
                    cx={pt.x} 
                    cy={pt.y} 
                    r="4" 
                    className="fill-indigo-650 hover:r-6 hover:fill-slate-850 stroke-white stroke-2 cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredPoint(pt.point)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                ))}

                {/* X Axis Labels */}
                {pointCoords.map((pt, idx) => {
                  // Only display every N labels to avoid crowding on 30days lists
                  const density = sortedTimeline.length > 10 ? Math.ceil(sortedTimeline.length / 5) : 1;
                  if (idx % density !== 0 && idx !== pointCoords.length -1) return null;

                  return (
                    <text 
                      key={idx}
                      x={pt.x} 
                      y={chartHeight - 10} 
                      textAnchor="middle" 
                      className="fill-slate-400 text-[9px] font-mono"
                    >
                      {pt.point.label}
                    </text>
                  );
                })}
              </svg>
            ) : (
              <div className="h-44 flex items-center justify-center text-slate-400 text-xs text-center w-full">
                No revenue transaction records found in chosen duration window.
              </div>
            )}
          </div>
        </div>

        {/* Supply category distribution chart */}
        <div className="bg-white p-5 border border-slate-105 rounded-2xl shadow-xs space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-800">Demand Per Device Category</h4>
            <p className="text-[10px] text-slate-400 italic">Dispatched hardware items mapped by class segments</p>
          </div>

          <div className="space-y-3 pt-2">
            {sortedCategories.map((cat, idx) => {
              const maxCatVal = Math.max(...sortedCategories.map(c => c.value), 1);
              const progressPct = (cat.value / maxCatVal) * 100;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-700 font-sans">
                    <span className="truncate max-w-44">{cat.name}</span>
                    <span className="font-mono text-slate-500">{cat.value} units</span>
                  </div>
                  <div className="h-2 w-full bg-slate-150 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {sortedCategories.length === 0 && (
              <div className="h-40 flex items-center justify-center text-slate-400 text-xs text-center">
                No specific category dispatches tracked. Fill standard orders to populate graphs.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Leaderboard and Logistics detail grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Client Top Hospitals Spending Leaderboard */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-xs p-5 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-bold text-slate-800">Top Partner Client Spend Analysis</h4>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold font-mono">Consolidated Rank</span>
          </div>

          <div className="divide-y divide-slate-100">
            {topHospitals.map((hosp, rank) => (
              <div key={rank} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold font-mono flex items-center justify-center text-[10px]">
                    {rank + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{hosp.name}</p>
                    <p className="text-[10px] text-slate-400">{hosp.ordersCount} operational consignments fulfilled</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-slate-900">₹{hosp.spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-[9px] text-[#166534] bg-emerald-50 px-1 rounded inline-block font-mono">Saved {hosp.saved > 0 ? `₹${Math.round(hosp.saved).toLocaleString('en-IN')}` : '0%'}</p>
                </div>
              </div>
            ))}

            {topHospitals.length === 0 && (
              <div className="py-10 text-center text-slate-400 text-xs">
                Leaderboard metrics currently unavailable.
              </div>
            )}
          </div>
        </div>

        {/* Order Dispatch Details list */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-xs p-5 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Clock className="w-4 h-4 text-indigo-500" />
              <h4 className="text-sm font-bold text-slate-800 font-sans">Recent Logistical Shipments Fulfilling</h4>
            </div>
            <span className="text-[10px] text-indigo-650 font-bold bg-indigo-50 px-2 py-0.5 rounded">Active List</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[240px] overflow-y-auto pr-1">
            {filteredOrders.slice(0, 5).map((ord, idx) => {
              const deviceQty = ord.items.reduce((a, b) => a + b.quantity, 0);
              const branchCity = branches.find(b => b.id === ord.branchId)?.city || 'Corporate';
              return (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{ord.hospitalName}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 flex-wrap font-mono">
                      <span>{deviceQty} units</span>
                      <span>•</span>
                      <span className="font-sans flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{branchCity}</span>
                    </div>
                  </div>
                  <div className="text-indigo-700 bg-indigo-50 px-2 py-1 rounded font-bold font-mono shrink-0">
                    ₹{ord.finalTotal?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || ord.items.reduce((a, b) => a + (b.price * b.quantity), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              );
            })}

            {filteredOrders.length === 0 && (
              <div className="py-10 text-center text-slate-400 text-xs">
                No recent consignments cataloged in this timeframe.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
