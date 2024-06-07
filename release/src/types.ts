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

export interface ReleaseProps {
  owner: string;
  repo: string;
  version: string;
  github: Octokit;
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
  labels: string | { name?: string }[];
  assignee: null |  { login: string };
  created_at: string;
};
