import type { USAGE_PROBLEM_MESSAGES } from "embedding-sdk/lib/usage-problem";

export interface SdkUsageProblem {
  type: SdkUsageProblemKey;
  severity: "warning" | "error";
  message: string;
  documentationUrl: string;
}

export type SdkUsageProblemKey = keyof typeof USAGE_PROBLEM_MESSAGES;
