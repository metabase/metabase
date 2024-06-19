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
  title: string;
  html_url: string;
  labels: { name: string }[];
  assignee: null | { login: string };
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
