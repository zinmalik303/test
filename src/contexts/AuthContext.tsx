import React, { createContext, useContext, useState, useEffect } from 'react';

import { mockUser } from '../data/initialData';






const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);


  useEffect(() => {
  const storedBalance = parseFloat(localStorage.getItem('user_balance') || '0');
  const storedTasks = parseInt(localStorage.getItem('tasks_completed') || '0');
  const storedUsername = localStorage.getItem('username') || 'Web3 User';
  const storedAvatar = localStorage.getItem('avatar');
  const joinedAt = localStorage.getItem('joined_at') || new Date().toISOString();
  const congratulated = localStorage.getItem('congratulated') === 'true';

  const newUser = {
    ...mockUser,
    username: storedUsername,
    avatar: storedAvatar,
    balance: storedBalance,
    totalEarned: storedBalance,
    tasksCompleted: storedTasks,
    joinedAt,
    congratulated
  };

  setUser(newUser);
  localStorage.setItem('mock_user_initialized', 'true');
}, []);


 

  const updateUserBalance = (amount: number) => {
  setUser(prev => {
    if (!prev) return null;
    const newUser = {
      ...prev,
      balance: prev.balance + amount,
      totalEarned: prev.totalEarned + amount
    };
    localStorage.setItem('user_balance', newUser.balance.toString());
    return newUser;
  });
};


  const updateTasksCompleted = (count: number) => {
    setUser(prev => {
      if (!prev) return null;
      const newUser = {
        ...prev,
        tasksCompleted: count
      };
      localStorage.setItem('tasks_completed', count.toString());
      return newUser;
    });
  };

  const updateProfile = (data: { username?: string; avatar?: string }) => {
    setUser(prev => {
      if (!prev) return null;
      const newUser = {
        ...prev,
        ...data
      };
      if (data.username) localStorage.setItem('username', data.username);
      if (data.avatar) localStorage.setItem('avatar', data.avatar);
      return newUser;
    });
  };
  const setUserAsCongratulated = () => {
  setUser(prev => {
    if (!prev) return null;
    return { ...prev, congratulated: true };
  });
};


  return (
    <AuthContext.Provider
      value={{
        user,
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