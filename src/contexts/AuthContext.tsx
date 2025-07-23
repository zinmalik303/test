import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  id: string;
  username: string;
  avatar?: string;
  balance: number;
  tasksCompleted: number;
  totalEarned: number;
  level: number;
  referralCode: string;
  joinedAt: string;
  congratulated: boolean;
}

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  isConnected: boolean;
  userWallet: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username?: string) => Promise<void>;
  signOut: () => Promise<void>;
  connectWallet: (walletType: string) => Promise<void>;
  disconnectWallet: () => void;
  updateUserBalance: (amount: number) => Promise<void>;
  updateTasksCompleted: (count: number) => Promise<void>;
  updateProfile: (data: { username?: string; avatar?: string }) => Promise<void>;
  setUserAsCongratulated: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userWallet, setUserWallet] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSupabaseUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSupabaseUser(session?.user ?? null);
      
      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      if (profile) {
        setUser({
          id: profile.id,
          username: profile.username,
          avatar: profile.avatar,
          balance: parseFloat(profile.balance.toString()),
          tasksCompleted: profile.tasks_completed,
          totalEarned: parseFloat(profile.total_earned.toString()),
          level: profile.level,
          referralCode: profile.referral_code,
          joinedAt: profile.created_at,
          congratulated: profile.congratulated,
        });
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, username = 'Web3 User') => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setUserWallet(null);
  };

  const connectWallet = async (walletType: string) => {
    // Mock wallet connection - in real app, integrate with actual wallet
    const mockWallet = '0x1234567890abcdef1234567890abcdef12345678';
    setUserWallet(mockWallet);
    
    // Create account with mock email
    const mockEmail = `${mockWallet}@wallet.local`;
    const mockPassword = 'wallet-password-123';
    
    try {
      await signUp(mockEmail, mockPassword, 'Web3 User');
    } catch (error) {
      // If user already exists, sign in
      await signIn(mockEmail, mockPassword);
    }
  };

  const disconnectWallet = () => {
    setUserWallet(null);
    signOut();
  };

  const updateUserBalance = async (amount: number) => {
    if (!supabaseUser || !user) return;

    const newBalance = user.balance + amount;
    const newTotalEarned = user.totalEarned + amount;

    const { error } = await supabase
      .from('profiles')
      .update({
        balance: newBalance,
        total_earned: newTotalEarned,
      })
      .eq('id', supabaseUser.id);

    if (error) {
      console.error('Error updating balance:', error);
      return;
    }

    setUser(prev => prev ? {
      ...prev,
      balance: newBalance,
      totalEarned: newTotalEarned,
    } : null);
  };

  const updateTasksCompleted = async (count: number) => {
    if (!supabaseUser || !user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ tasks_completed: count })
      .eq('id', supabaseUser.id);

    if (error) {
      console.error('Error updating tasks completed:', error);
      return;
    }

    setUser(prev => prev ? { ...prev, tasksCompleted: count } : null);
  };

  const updateProfile = async (data: { username?: string; avatar?: string }) => {
    if (!supabaseUser || !user) return;

    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', supabaseUser.id);

    if (error) {
      console.error('Error updating profile:', error);
      return;
    }

    setUser(prev => prev ? { ...prev, ...data } : null);
  };

  const setUserAsCongratulated = async () => {
    if (!supabaseUser || !user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        congratulated: true,
        has_given_reward: true 
      })
      .eq('id', supabaseUser.id);

    if (error) {
      console.error('Error setting congratulated:', error);
      return;
    }

    setUser(prev => prev ? { ...prev, congratulated: true } : null);
  };

  const isConnected = !!supabaseUser && !!userWallet;

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        isConnected,
        userWallet,
        loading,
        signIn,
        signUp,
        signOut,
        connectWallet,
        disconnectWallet,
        updateUserBalance,
        updateTasksCompleted,
        updateProfile,
        setUserAsCongratulated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};