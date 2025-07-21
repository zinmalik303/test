import React, { createContext, useContext, useState, useEffect } from 'react';
import { Task, TaskStatus, TaskSubmission } from '../types';
import { mockTasks } from '../data/initialData';
import { useAuth } from './AuthContext';

interface TaskContextType {
  tasks: Task[];
  userSubmissions: TaskSubmission[];
  getTaskById: (id: string) => Task | undefined;
  getUserTaskSubmission: (taskId: string) => TaskSubmission | undefined;
  submitTask: (
    taskId: string,
    data: { screenshot?: string; text?: string },
    onFirstFail?: () => void
  ) => Promise<void>;

  isVerifying: boolean;
  verificationCountdown: number;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

const MAX_STORED_SUBMISSIONS = 1000;

const optimizeSubmissionForStorage = (submission: TaskSubmission): TaskSubmission => {
  return {
    taskId: submission.taskId,
    userId: submission.userId,
    status: submission.status,
    submittedAt: submission.submittedAt,
    text: submission.text?.slice(0, 1000) || undefined,
    screenshot: submission.screenshot ? 'screenshot-saved' : undefined,
  };
};

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks] = useState<Task[]>(mockTasks);
  const { updateTasksCompleted } = useAuth();

  const [userSubmissions, setUserSubmissions] = useState<TaskSubmission[]>(() => {
    try {
      const stored = localStorage.getItem('userSubmissions');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load userSubmissions from localStorage:', error);
    }
    return [];
  });

  const [failAttemptCount, setFailAttemptCount] = useState(() => {
    const raw = localStorage.getItem('failAttemptCount');
    return raw ? parseInt(raw) : 0;
  });

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationCountdown, setVerificationCountdown] = useState(10);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const checkVerification = () => {
      const failAtRaw = localStorage.getItem('verificationFailAt');
      if (!failAtRaw) return;

      const failAt = parseInt(failAtRaw);
      const timeLeft = Math.max(0, Math.floor((failAt - Date.now()) / 1000));
      if (timeLeft > 0) {
        setIsVerifying(true);
        setVerificationCountdown(timeLeft);

        interval = setInterval(() => {
          const newTimeLeft = Math.max(0, Math.floor((failAt - Date.now()) / 1000));
          setVerificationCountdown(newTimeLeft);

          if (newTimeLeft <= 0) {
            clearInterval(interval!);
            localStorage.removeItem('verificationFailAt');
            setIsVerifying(false);
            window.dispatchEvent(new Event('task-verification-failed'));
          }
        }, 500);
      } else {
        localStorage.removeItem('verificationFailAt');
      }
    };

    checkVerification();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    try {
      const recentSubmissions = userSubmissions
        .slice(-MAX_STORED_SUBMISSIONS)
        .map(optimizeSubmissionForStorage);

      localStorage.setItem('userSubmissions', JSON.stringify(recentSubmissions));
    } catch (error) {
      console.error('Error saving submissions to localStorage:', error);
    }
  }, [userSubmissions]);

  const getTaskById = (id: string): Task | undefined => {
    return tasks.find((task) => task.id === id);
  };

  const getUserTaskSubmission = (taskId: string): TaskSubmission | undefined => {
    return userSubmissions.find((submission) => submission.taskId === taskId);
  };

  const submitTask = (
    taskId: string,
    data: { screenshot?: string; text?: string },
    onFirstFail?: () => void
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      const failAt = Date.now() + 10000;
      localStorage.setItem('verificationFailAt', failAt.toString());
      localStorage.setItem('verifyingTaskId', taskId);

      setIsVerifying(true);
      setVerificationCountdown(10);

      const interval = setInterval(() => {
        const timeLeft = Math.max(0, Math.floor((failAt - Date.now()) / 1000));
        setVerificationCountdown(timeLeft);

        if (timeLeft > 0) return;

        clearInterval(interval);
        setIsVerifying(false);
        localStorage.removeItem('verificationFailAt');

        const handleSuccess = () => {
          const newSubmission: TaskSubmission = {
            taskId,
            userId: '0x1234...5678',
            screenshot: data.screenshot,
            text: data.text,
            status: 'Approved',
            submittedAt: new Date().toISOString(),
          };

          setUserSubmissions((prev) => {
            const exists = prev.some((sub) => sub.taskId === taskId);
            const newSubmissions = exists
              ? prev.map((sub) => sub.taskId === taskId ? newSubmission : sub)
              : [...prev, newSubmission].slice(-MAX_STORED_SUBMISSIONS);

            setTimeout(() => {
              if (!['telegram', 'instagram'].includes(taskId)) {
                updateTasksCompleted(
                  newSubmissions.filter((s, index, self) => s.status === 'Approved' && self.findIndex(x => x.taskId === s.taskId) === index).length
                );
              }
              resolve(true);
            }, 500);

            return newSubmissions;
          });
        };

        if (['telegram', 'instagram'].includes(taskId)) {
          const firstFailKey = 'dashboard_first_fail_done';
          const alreadyFailed = localStorage.getItem(firstFailKey) === 'true';
          if (!alreadyFailed) {
            localStorage.setItem(firstFailKey, 'true');
            if (onFirstFail) onFirstFail();
            window.dispatchEvent(new Event('task-verification-failed'));
            resolve(false);
            return;
          }
          handleSuccess();
          return;
        }

        if (taskId === 'survey') {
          handleSuccess();
          return;
        }

        const globalAttemptRaw = localStorage.getItem('globalAttemptCount');
        const globalAttempt = globalAttemptRaw ? parseInt(globalAttemptRaw) : 1;

        if ([1, 4, 5].includes(globalAttempt)) {
          const updated = failAttemptCount + 1;
          setFailAttemptCount(updated);
          localStorage.setItem('failAttemptCount', updated.toString());

          if (onFirstFail) onFirstFail();
          window.dispatchEvent(new Event('task-verification-failed'));
          resolve(false);
          return;
        }

        handleSuccess();
      });
    });
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        userSubmissions,
        getTaskById,
        getUserTaskSubmission,
        submitTask,
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
