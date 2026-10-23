import type { AdvisorySeverity } from "metabase-types/api";

export type AdvisoryFilter = {
  severity: AdvisorySeverity | "all";
  showAcknowledged: boolean;
};

export type HealthCheckStatus = "pass" | "fail" | "unknown";

export type HealthCheckDatabaseResult = {
  database: string;
  status: HealthCheckStatus;
  reason?: string;
  ms?: number;
};

export type HealthCheck = {
  id: string;
  status: HealthCheckStatus;
  title: string;
  description: string;
  remediation: string;
  docs_url: string;
  requires_restart: boolean;
  background: boolean;
  running?: boolean;
  details?: string[];
  reason?: string;
  databases?: HealthCheckDatabaseResult[];
  checked_at: string;
  ms: number;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
};
