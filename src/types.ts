export type UserRole = 'super_admin' | 'branch_admin' | 'hospital';

export interface UserStaffMember {
  id: string;
  name: string;
  phone: string;
  designation: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: string | null;      // If branch_admin, they manage this branch
  hospitalName?: string | null; // If hospital user
  discountRate?: number;        // Hospital specific discount percentage (e.g. 15 for 15%)
  hospitalCity?: string | null;     // Hospital's operating city
  hospitalAddress?: string | null;  // Hospital's physical delivery or operating address
  coordinatorName?: string | null; // Point of contact coordinator person name
  hospitalPhone?: string | null;    // Phone number for coordination
  staffList?: UserStaffMember[];    // Clinical authorized staff members (up to 3)
  createdAt: number;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  address: string;
  contactPhone: string;
  discounts?: BranchDiscount[]; // Nested fallback discounts to bypass Firestore rules limitations
  createdAt: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  unit: string; // e.g., "Tray", "Box", "Unit"
  imageUrl?: string;
  // Multi-branch stock management
  stock: { [branchId: string]: number }; 
  createdAt: number;
}

export interface DeliveryItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  price: number;
  appliedDiscountRate?: number;
  appliedDiscountAmount?: number;
  isProductSpecific?: boolean;
}

export interface BranchDiscount {
  id: string;
  branchId: string;
  hospitalUid: string;
  productId: string;
  discountPercent: number;
  createdAt: number;
  updatedAt: number;
}

export type DeliveryStatus = 'pending' | 'preparing' | 'shipping' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'partially_paid' | 'paid';

export interface DeliveryOrder {
  id: string;
  hospitalUid: string;
  hospitalName: string;
  city: string;
  address: string;
  contactPhone: string;
  items: DeliveryItem[];
  branchId: string; // Ordered from this branch
  status: DeliveryStatus;
  notes: string;
  createdAt: number;
  updatedAt: number;
  discountPercent?: number;  // Saved discount percentage (e.g., 10 for 10%)
  discountAmount?: number;   // Calculated discount amount subtracted
  finalTotal?: number;       // Calculated total price after discount
  
  // Financial & Payment Metrics
  paymentStatus?: PaymentStatus; // pending, partially_paid, paid
  advancePayment?: number;       // Any advance payment received
  lumpSumPayment?: number;       // Total lump sum payments received
  outstandingBalance?: number;   // Calculated left to pay
  orderedByStaff?: string;       // Name of user/person placing the order (max 3 person concept)
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: number;
}
