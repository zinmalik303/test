import React, { createContext, useContext, useState, useEffect } from 'react';
import { Task, TaskStatus } from '../types';
import { mockTasks } from '../data/initialData';
import { useAuth } from './AuthContext';
import { supabase, TaskSubmission as DBTaskSubmission, UserProgress } from '../lib/supabase';

interface TaskSubmission {
  taskId: string;
  userId: string;
  status: TaskStatus;
  submittedAt: string;
  text?: string;
  screenshot?: string;
}

interface TaskContextType {
  tasks: Task[];
  userSubmissions: TaskSubmission[];
  completedTasks: Record<string, boolean>;
  completedFirstClick: Record<string, boolean>;
  visitedTasks: Record<string, boolean>;
  globalAttemptCount: number;
  failAttemptCount: number;
  getTaskById: (id: string) => Task | undefined;
  getUserTaskSubmission: (taskId: string) => TaskSubmission | undefined;
  submitTask: (
    taskId: string,
    data: { screenshot?: string; text?: string },
    onFirstFail?: () => void
  ) => Promise<boolean>;
  updateCompletedTasks: (taskId: string, completed: boolean) => Promise<void>;
  updateCompletedFirstClick: (taskId: string, clicked: boolean) => Promise<void>;
  updateVisitedTasks: (taskId: string, visited: boolean) => Promise<void>;
  incrementGlobalAttemptCount: () => Promise<void>;
  incrementFailAttemptCount: () => Promise<void>;
  isVerifying: boolean;
  verificationCountdown: number;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks] = useState<Task[]>(mockTasks);
  const [userSubmissions, setUserSubmissions] = useState<TaskSubmission[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});
  const [completedFirstClick, setCompletedFirstClick] = useState<Record<string, boolean>>({});
  const [visitedTasks, setVisitedTasks] = useState<Record<string, boolean>>({});
  const [globalAttemptCount, setGlobalAttemptCount] = useState(0);
  const [failAttemptCount, setFailAttemptCount] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCountdown, setVerificationCountdown] = useState(10);

  const { supabaseUser, updateTasksCompleted } = useAuth();

  // Load user data when user changes
  useEffect(() => {
    if (supabaseUser) {
      loadUserSubmissions();
      loadUserProgress();
    } else {
      // Reset state when user logs out
      setUserSubmissions([]);
      setCompletedTasks({});
      setCompletedFirstClick({});
      setVisitedTasks({});
      setGlobalAttemptCount(0);
      setFailAttemptCount(0);
    }
  }, [supabaseUser]);

  const loadUserSubmissions = async () => {
    if (!supabaseUser) return;

    try {
      const { data, error } = await supabase
        .from('task_submissions')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading submissions:', error);
        return;
      }

      const submissions: TaskSubmission[] = data.map((sub: DBTaskSubmission) => ({
        taskId: sub.task_id,
        userId: sub.user_id,
        status: sub.status as TaskStatus,
        submittedAt: sub.submitted_at,
        text: sub.text || undefined,
        screenshot: sub.screenshot || undefined,
      }));

      setUserSubmissions(submissions);
    } catch (error) {
      console.error('Error in loadUserSubmissions:', error);
    }
  };

  const loadUserProgress = async () => {
    if (!supabaseUser) return;

    try {
      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading progress:', error);
        return;
      }

      if (data) {
        setCompletedTasks(data.completed_tasks || {});
        setCompletedFirstClick(data.completed_first_click || {});
        setVisitedTasks(data.visited_tasks || {});
        setGlobalAttemptCount(data.global_attempt_count || 0);
        setFailAttemptCount(data.fail_attempt_count || 0);
      }
    } catch (error) {
      console.error('Error in loadUserProgress:', error);
    }
  };

  const saveUserProgress = async (updates: Partial<UserProgress>) => {
    if (!supabaseUser) return;

    try {
      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: supabaseUser.id,
          ...updates,
        });

      if (error) {
        console.error('Error saving progress:', error);
      }
    } catch (error) {
      console.error('Error in saveUserProgress:', error);
    }
  };

  const getTaskById = (id: string): Task | undefined => {
    return tasks.find((task) => task.id === id);
  };

  const getUserTaskSubmission = (taskId: string): TaskSubmission | undefined => {
    return userSubmissions.find((submission) => submission.taskId === taskId);
  };

  const submitTask = async (
    taskId: string,
    data: { screenshot?: string; text?: string },
    onFirstFail?: () => void
  ): Promise<boolean> => {
    if (!supabaseUser) return false;

    return new Promise((resolve) => {
      const failAt = Date.now() + 10000;
      setIsVerifying(true);
      setVerificationCountdown(10);

      const interval = setInterval(async () => {
        const timeLeft = Math.max(0, Math.floor((failAt - Date.now()) / 1000));
        setVerificationCountdown(timeLeft);

        if (timeLeft > 0) return;

        clearInterval(interval);
        setIsVerifying(false);

        const handleSuccess = async () => {
          try {
            const { data: submission, error } = await supabase
              .from('task_submissions')
              .upsert({
                user_id: supabaseUser.id,
                task_id: taskId,
                status: 'Approved',
                screenshot: data.screenshot,
                text: data.text,
                submitted_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (error) {
              console.error('Error submitting task:', error);
              resolve(false);
              return;
            }

            // Update local state
            const newSubmission: TaskSubmission = {
              taskId: submission.task_id,
              userId: submission.user_id,
              status: submission.status as TaskStatus,
              submittedAt: submission.submitted_at,
              text: submission.text || undefined,
              screenshot: submission.screenshot || undefined,
            };

            setUserSubmissions(prev => {
              const filtered = prev.filter(sub => sub.taskId !== taskId);
              return [...filtered, newSubmission];
            });

            // Update tasks completed count
            setTimeout(async () => {
              if (!['telegram', 'instagram'].includes(taskId)) {
                const approvedCount = userSubmissions.filter(s => s.status === 'Approved').length + 1;
                await updateTasksCompleted(approvedCount);
              }
              resolve(true);
            }, 500);

          } catch (error) {
            console.error('Error in handleSuccess:', error);
            resolve(false);
          }
        };

        if (['telegram', 'instagram'].includes(taskId)) {
          const alreadyFailed = completedFirstClick[`${taskId}_failed`] || false;
          if (!alreadyFailed) {
            await updateCompletedFirstClick(`${taskId}_failed`, true);
            if (onFirstFail) onFirstFail();
            window.dispatchEvent(new Event('task-verification-failed'));
            resolve(false);
            return;
          }
          await handleSuccess();
          return;
        }

        if (taskId === 'survey') {
          await handleSuccess();
          return;
        }

        if ([1, 4, 5].includes(globalAttemptCount + 1)) {
          await incrementFailAttemptCount();
          if (onFirstFail) onFirstFail();
          window.dispatchEvent(new Event('task-verification-failed'));
          resolve(false);
          return;
        }

        await handleSuccess();
      }, 1000);
    });
  };

  const updateCompletedTasks = async (taskId: string, completed: boolean) => {
    const newCompletedTasks = { ...completedTasks, [taskId]: completed };
    setCompletedTasks(newCompletedTasks);
    await saveUserProgress({ completed_tasks: newCompletedTasks });
  };

  const updateCompletedFirstClick = async (taskId: string, clicked: boolean) => {
    const newCompletedFirstClick = { ...completedFirstClick, [taskId]: clicked };
    setCompletedFirstClick(newCompletedFirstClick);
    await saveUserProgress({ completed_first_click: newCompletedFirstClick });
  };

  const updateVisitedTasks = async (taskId: string, visited: boolean) => {
    const newVisitedTasks = { ...visitedTasks, [taskId]: visited };
    setVisitedTasks(newVisitedTasks);
    await saveUserProgress({ visited_tasks: newVisitedTasks });
  };

  const incrementGlobalAttemptCount = async () => {
    const newCount = globalAttemptCount + 1;
    setGlobalAttemptCount(newCount);
    await saveUserProgress({ global_attempt_count: newCount });
  };

  const incrementFailAttemptCount = async () => {
    const newCount = failAttemptCount + 1;
    setFailAttemptCount(newCount);
    await saveUserProgress({ fail_attempt_count: newCount });
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        userSubmissions,
        completedTasks,
        completedFirstClick,
        visitedTasks,
        globalAttemptCount,
        failAttemptCount,
        getTaskById,
        getUserTaskSubmission,
        submitTask,
        updateCompletedTasks,
        updateCompletedFirstClick,
        updateVisitedTasks,
        incrementGlobalAttemptCount,
        incrementFailAttemptCount,
        isVerifying,
        verificationCountdown,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = (): TaskContextType => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};