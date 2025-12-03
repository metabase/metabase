import type { USAGE_PROBLEM_MESSAGES } from "embedding-sdk-bundle/lib/usage-problem";

export interface SdkUsageProblem {
  type: SdkUsageProblemKey;
  severity: "warning" | "error";
  title: string;
  message: string;
  documentationUrl: string;
}

export type SdkUsageProblemKey = keyof typeof USAGE_PROBLEM_MESSAGES;
