import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Branch, UserRole } from '../types';
import { Users, Shield, Award, Landmark, MapPin, Check, Save } from 'lucide-react';

interface UserManagementTabProps {
  currentUserProfile: UserProfile | null;
  usersList: UserProfile[];
  branches: Branch[];
}

export default function UserManagementTab({ currentUserProfile, usersList, branches }: UserManagementTabProps) {
  const isSuperAdmin = currentUserProfile?.role === 'super_admin';
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState<UserRole>('hospital');
  const [targetBranchId, setTargetBranchId] = useState<string>('');

  const handleStartEdit = (user: UserProfile) => {
    setEditingUserId(user.uid);
    setTargetRole(user.role);
    setTargetBranchId(user.branchId || '');
  };

  const handleSaveUser = async (user: UserProfile) => {
    const path = `users/${user.uid}`;
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        role: targetRole,
        branchId: targetRole === 'branch_admin' ? (targetBranchId || null) : null,
      });
      setEditingUserId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return 'bg-[#0F172A] border-[#0F172A] text-white';
      case 'branch_admin':
        return 'bg-[#3B82F6]/10 border-[#3B82F6]/20 text-[#3B82F6]';
      case 'hospital':
        return 'bg-[#DCFCE7] border-[#DCFCE7] text-[#166534]';
    }
  };

  return (
    <div id="user-management-tab" className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <h2 className="text-xl font-bold text-slate-800">Operational Role Security</h2>
        <p className="text-slate-500 text-sm mt-1">Assign admin credentials, filter hospital access, and align branch coordinators</p>
      </div>

      {/* Warning/Info */}
      {!isSuperAdmin && (
        <div className="bg-amber-55/10 border border-amber-200 text-amber-900 p-4 rounded-xl flex items-start gap-2.5">
          <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Access Warning</p>
            <p className="mt-0.5">Only Super Administrators possess authorization keys to promote user accounts or bind coordinators to specific warehouse cities.</p>
          </div>
        </div>
      )}

      {/* User Table Grid */}
      <div className="bg-white border border-slate-100 shadow-xs rounded-2xl overflow-hidden">
        <div className="p-4 bg-slate-50/50 border-b border-slate-100">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
            Registered Personnel & Logistics Entities ({usersList.length})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold tracking-wider text-slate-400 bg-slate-50/30 uppercase">
                <th className="px-6 py-4">Full Identity Details</th>
                <th className="px-6 py-4">Auth Access Role</th>
                <th className="px-6 py-4">Assigned Active Hub</th>
                {isSuperAdmin && <th className="px-6 py-4 text-right">Coordinate</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {usersList.map(user => {
                const assignedBranch = branches.find(b => b.id === user.branchId);
                const isEditing = editingUserId === user.uid;

                return (
                  <tr key={user.uid} className="hover:bg-slate-50/45 transition-all">
                    {/* User info */}
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-slate-100 border border-slate-200 text-slate-600 rounded-full flex items-center justify-center font-bold font-mono text-xs select-none">
                          {user.displayName ? user.displayName.substring(0, 2).toUpperCase() : 'CO'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 leading-tight">{user.displayName || 'Unnamed User'}</p>
                          <p className="text-slate-400 text-xs font-mono mt-0.5">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role badge or editor */}
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <select
                          value={targetRole}
                          onChange={(e) => setTargetRole(e.target.value as UserRole)}
                          className="text-xs bg-white border border-slate-300 rounded px-2 py-1 font-semibold focus:outline-hidden text-slate-800"
                        >
                          <option value="super_admin">Super Admin</option>
                          <option value="branch_admin">Branch Admin</option>
                          <option value="hospital">Hospital User (Client)</option>
                        </select>
                      ) : (
                        <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2.5 py-1 ${getRoleBadgeColor(user.role)}`}>
                          {user.role === 'super_admin' ? 'Super Admin' : user.role === 'branch_admin' ? 'Branch Admin' : 'Hospital User'}
                        </span>
                      )}
                    </td>

                    {/* Assigned region / Hub */}
                    <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                      {isEditing && targetRole === 'branch_admin' ? (
                        <select
                          value={targetBranchId}
                          onChange={(e) => setTargetBranchId(e.target.value)}
                          className="text-xs bg-white border border-slate-300 rounded px-2 py-1 focus:outline-hidden text-slate-800"
                        >
                          <option value="">Select Physical Branch...</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.city} ({b.name})</option>
                          ))}
                        </select>
                      ) : user.role === 'branch_admin' ? (
                        assignedBranch ? (
                          <div className="flex items-center gap-1.5 text-indigo-700">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span>{assignedBranch.city} Central ({assignedBranch.name})</span>
                          </div>
                        ) : (
                          <span className="text-amber-600 font-normal italic">No physical hub assigned</span>
                        )
                      ) : user.role === 'hospital' ? (
                        user.hospitalName ? (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Landmark className="w-3.5 h-3.5 shrink-0" />
                            <span>Clinic: {user.hospitalName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Standard Hospital Client</span>
                        )
                      ) : (
                        <span className="text-slate-400 font-mono text-[10px] uppercase">Corporate Headquarters</span>
                      )}
                    </td>

                    {/* Quick inline controls */}
                    {isSuperAdmin && (
                      <td className="px-6 py-4 text-right text-xs">
                        {isEditing ? (
                          <button
                            onClick={() => handleSaveUser(user)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-1 px-3 rounded flex items-center gap-1 ml-auto text-[11px]"
                          >
                            <Save className="w-3 h-3" /> Save Changes
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartEdit(user)}
                            className="border border-slate-205 hover:bg-slate-100 text-slate-600 font-bold py-1 px-3 rounded-lg text-[11px]"
                          >
                            Modify Credentials
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {usersList.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-405 text-sm">
                    No registry users found. Refreshing connections...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
