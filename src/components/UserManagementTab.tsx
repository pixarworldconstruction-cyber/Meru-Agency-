import React, { useState } from 'react';
import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, Branch, UserRole } from '../types';
import { 
  Users, Shield, Award, Landmark, MapPin, Check, Save, 
  UserPlus, Mail, Lock, UserCheck, ShieldAlert, Key, Loader2, Eye, EyeOff, Trash2
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

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

  // Form states for creating a new user (with password and email)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('branch_admin');
  const [newBranchId, setNewBranchId] = useState('');
  const [newHospitalName, setNewHospitalName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [creationLoading, setCreationLoading] = useState(false);
  const [creationSuccess, setCreationSuccess] = useState('');
  const [creationError, setCreationError] = useState('');

  const handleDeleteUser = async (userUid: string) => {
    if (!window.confirm("Are you sure you want to delete this user profile? This action will instantly revoke their logon authority and platform access.")) {
      return;
    }
    const path = `users/${userUid}`;
    try {
      await deleteDoc(doc(db, 'users', userUid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleStartEdit = (user: UserProfile) => {
    setEditingUserId(user.uid);
    setTargetRole(user.role);
    setTargetBranchId(user.branchId || '');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreationError('');
    setCreationSuccess('');

    if (!newEmail.trim() || !newPassword.trim() || !newDisplayName.trim()) {
      setCreationError('All fields (Name, Email ID, and Password) are required to register credentials.');
      return;
    }

    if (newPassword.length < 6) {
      setCreationError('Password strength required: must be at least 6 characters.');
      return;
    }

    if (newRole === 'branch_admin' && !newBranchId) {
      setCreationError('Logistics setup required: Please associate a Regional Hub to this Branch Admin.');
      return;
    }

    setCreationLoading(true);

    let tempApp;
    try {
      // 1. Initialize a temporary Firebase App instance so we don't log the Super Admin out
      const appName = `Creator-${Date.now()}`;
      tempApp = initializeApp(firebaseConfig, appName);
      const tempAuth = getAuth(tempApp);

      // 2. Perform authenticating credential enrollment on the secondary context
      const userCredential = await createUserWithEmailAndPassword(tempAuth, newEmail.trim(), newPassword);
      const newUser = userCredential.user;

      // 3. Formulate the database profile payload
      const userProfilePayload: UserProfile = {
        uid: newUser.uid,
        email: newEmail.trim().toLowerCase(),
        displayName: newDisplayName.trim(),
        role: newRole,
        branchId: newRole === 'branch_admin' ? newBranchId : null,
        hospitalName: newRole === 'hospital' ? (newHospitalName.trim() || 'General Client Clinic') : null,
        createdAt: Date.now()
      };

      // 4. Securely record user profile to the main database instance using the Super Admin's credentials
      const profileRef = doc(db, 'users', newUser.uid);
      await setDoc(profileRef, userProfilePayload);

      // 5. Present success feedback and clear registration fields
      const formattedRole = newRole === 'super_admin' ? 'Super Admin' : newRole === 'branch_admin' ? 'Branch Admin' : 'Hospital User';
      setCreationSuccess(`Success! ${newDisplayName.trim()} has been registered as "${formattedRole}" with email ID: ${newEmail.trim()}.`);
      
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewBranchId('');
      setNewHospitalName('');
    } catch (err: any) {
      console.error("Operational Registry Error: ", err);
      setCreationError(err.message || 'Verification rejected. Could not register account credentials.');
    } finally {
      if (tempApp) {
        try {
          await deleteApp(tempApp);
        } catch (delErr) {
          console.warn("Clean-up warning on sandbox application context: ", delErr);
        }
      }
      setCreationLoading(false);
    }
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
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Operational Role Security</h2>
          <p className="text-slate-500 text-sm mt-1">Assign admin credentials, filter hospital access, and align branch coordinators</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setCreationSuccess('');
              setCreationError('');
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            {showCreateForm ? 'Hide Registry Form' : 'Register New Personnel'}
          </button>
        )}
      </div>

      {/* Registry Form Card */}
      {isSuperAdmin && showCreateForm && (
        <div className="bg-white border border-indigo-100 shadow-md rounded-2xl p-6 transition-all duration-300">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-base">Register New Personnel Credentials</h3>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            {creationSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs flex items-center gap-2.5 font-sans">
                <Check className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                <p className="font-medium">{creationSuccess}</p>
              </div>
            )}

            {creationError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs flex items-center gap-2.5 font-sans">
                <ShieldAlert className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                <p className="font-medium">{creationError}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Full Identity Name</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Users className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-indigo-505 focus:outline-hidden text-slate-800"
                  />
                </div>
              </div>

              {/* Email ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Logon Email ID (Admin ID)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="name@medlogix.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-indigo-505 focus:outline-hidden text-slate-800"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Access Password</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2 text-xs focus:ring-1 focus:ring-indigo-505 focus:outline-hidden text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Account Role */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Assigned Security Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-505 focus:outline-hidden text-slate-800 font-semibold"
                >
                  <option value="branch_admin">Branch Admin (Warehouse Manager)</option>
                  <option value="super_admin">Super Admin (Central Manager)</option>
                  <option value="hospital">Hospital User (Client Procurement)</option>
                </select>
              </div>

              {/* Conditional Hub or Clinic Detail */}
              <div>
                {newRole === 'branch_admin' && (
                  <>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Designated Regional Hub Branch</label>
                    <select
                      required
                      value={newBranchId}
                      onChange={(e) => setNewBranchId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-505 focus:outline-hidden text-slate-800"
                    >
                      <option value="">Choose designated hub...</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.city} ({b.name})</option>
                      ))}
                    </select>
                  </>
                )}

                {newRole === 'hospital' && (
                  <>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Partner Clinic / Hospital Name</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400">
                        <Landmark className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        required
                        value={newHospitalName}
                        onChange={(e) => setNewHospitalName(e.target.value)}
                        placeholder="e.g. St. Jude Surgical Center"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-indigo-505 focus:outline-hidden text-slate-800"
                      />
                    </div>
                  </>
                )}

                {newRole === 'super_admin' && (
                  <div className="bg-[#EDF2F7] border border-slate-200 text-slate-600 p-3 rounded-xl text-[10px] h-full flex items-center font-sans">
                    <p className="font-medium text-slate-500 leading-relaxed">
                      Note: Super Admins possess unrestricted system privileges, absolute control over catalog, and global user management tools. Use with appropriate care.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreationSuccess('');
                  setCreationError('');
                }}
                className="border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold py-2 px-4 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creationLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold py-2 px-5 rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {creationLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Registering...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" /> Confirm Enrollment
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

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
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleSaveUser(user)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 text-[11px] cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" /> Save
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="border border-slate-200 hover:bg-slate-100 text-slate-500 font-bold px-3 py-1.5 rounded text-[11px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(user)}
                              className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-1.5 px-3 rounded-lg text-[11px] cursor-pointer"
                            >
                              Modify
                            </button>
                            {user.uid !== currentUserProfile?.uid && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(user.uid)}
                                className="border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold py-1.5 px-3 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            )}
                          </div>
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
