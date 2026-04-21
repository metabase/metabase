export interface SdkUsageProblem {
  type: SdkUsageProblemKey;
  severity: "warning" | "error";
  title: string;
  message: string;
  documentationUrl: string;
}

/**
 * Usage problem keys. Must stay in sync with USAGE_PROBLEM_MESSAGES in
 * embedding-sdk-bundle/lib/usage-problem.ts — kept as a literal union here
 * so the shared type doesn't depend on the runtime's value map.
 */
export type SdkUsageProblemKey =
  | "API_KEYS_WITHOUT_LICENSE"
  | "API_KEYS_WITH_LICENSE"
  | "SSO_WITHOUT_LICENSE"
  | "EMBEDDING_SDK_NOT_ENABLED"
  | "DEVELOPMENT_MODE_CLOUD_INSTANCE"
  | "JWT_EXP_NULL";
