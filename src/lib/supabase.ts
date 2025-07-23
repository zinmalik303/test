import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Profile {
  id: string;
  username: string;
  avatar?: string;
  balance: number;
  tasks_completed: number;
  total_earned: number;
  level: number;
  referral_code: string;
  congratulated: boolean;
  has_given_reward: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskSubmission {
  id: string;
  user_id: string;
  task_id: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  screenshot?: string;
  text?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  completed_tasks: Record<string, boolean>;
  completed_first_click: Record<string, boolean>;
  visited_tasks: Record<string, boolean>;
  global_attempt_count: number;
  fail_attempt_count: number;
  created_at: string;
  updated_at: string;
}