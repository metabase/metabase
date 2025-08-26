export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranch {
  id: number;
  name: string;
  slug: string;
  description?: string;
  creator_id: number;
  parent_branch_id?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateBranchRequest {
  name: string;
  description?: string;
  parent_branch_id?: number;
}

export interface SwitchBranchRequest {
  branchName: string;
}

export interface GitSyncStatus {
  currentBranch: string;
  isDirty: boolean;
  ahead: number;
  behind: number;
}

export interface GitDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  content: any;
}
