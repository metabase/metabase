import type { Octokit } from "@octokit/rest";

export interface CacheType {
  version?: string;
  majorVersion?: string;
  releaseBranch?: string;
  commitHash?: string;
  versionType?: "major" | "minor" | "patch" | "rc" | "invalid";
  releaseType?: "public" | "private";
  failedStep?: string;
  completedSteps?: string[];
  slackMessageId?: string;
  slackBlocks?: Record<string, any>[];
  milestoneId?: number;
  slackChannelId?: string;
  preReleaseActionId?: number;
}
export interface GithubProps {
  owner: string;
  repo: string;
  github: Octokit;
}

export interface ReleaseProps extends GithubProps {
  version: string;
}

export interface VersionInfo {
  version: string;
  released: string;
  patch: boolean;
  highlights: string[];
}

export interface VersionInfoFile {
  latest: VersionInfo;
  older: VersionInfo[];
}

export type Issue = {
  number: number;
  node_id: string;
  title: string;
  html_url: string;
  body: string;
  pull_request?: { html_url: string }; // only present on PRs
  milestone?: Milestone;
  labels: string | { name?: string }[];
  assignee: null |  { login: string };
  created_at: string;
};

export type Milestone =  {
  url: string;
  html_url: string;
  labels_url: string;
  id: number;
  node_id: string;
  number: number;
  state: "open" | "closed";
  title: string;
  description: string | null;
};

export type Commit = {
  sha: string;
  commit: {
    message: string;
  };
};

export type Tag = {
  ref: string;
  node_id: string,
  url: string,
  object: {
    sha: string,
    type: string,
    url: string,
  }
};

export type GithubCheck = {
  id: number;
  name: string;
  node_id: string;
  head_sha: string;
  external_id: string | null;
  url: string | null;
  html_url: string | null;
  details_url: string | null;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required" | "skipped" | null;
  started_at: string | null;
  completed_at: string | null;
};
