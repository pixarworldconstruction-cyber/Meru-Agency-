export type UserRole = 'super_admin' | 'branch_admin' | 'hospital';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: string | null;      // If branch_admin, they manage this branch
  hospitalName?: string | null; // If hospital user
  createdAt: number;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  address: string;
  contactPhone: string;
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
}

export type DeliveryStatus = 'pending' | 'preparing' | 'shipping' | 'delivered' | 'cancelled';

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
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: number;
}
