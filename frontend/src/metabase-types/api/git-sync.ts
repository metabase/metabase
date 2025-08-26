export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranch {
  name: string;
  sha: string;
  protected: boolean;
  isDefault: boolean;
  lastCommit: GitCommit;
}

export interface CreateBranchRequest {
  name: string;
  sourceBranch?: string;
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
