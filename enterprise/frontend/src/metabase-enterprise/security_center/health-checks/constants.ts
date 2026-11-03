import type { HealthCheckStatus } from "metabase-types/api";

export const HEALTH_CHECK_STATUSES = [
  "fail",
  "unknown",
  "pass",
] as const satisfies HealthCheckStatus[];
