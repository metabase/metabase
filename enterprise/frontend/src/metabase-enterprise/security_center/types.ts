export type AdvisorySeverity = "critical" | "high" | "medium" | "low";

export type AdvisoryMatchStatus =
  | "active"
  | "resolved"
  | "not_affected"
  | "error";

export type AdvisoryVersionRange = {
  min: string;
  fixed: string;
};

export type Advisory = {
  advisory_id: string;
  title: string;
  description: string;
  severity: AdvisorySeverity;
  advisory_url: string | null;
  remediation: string;
  published_at: string;
  match_status: AdvisoryMatchStatus;
  last_evaluated_at: string | null;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
  affected_versions: AdvisoryVersionRange[];
};

export type AdvisoryFilter = {
  severity: AdvisorySeverity | "all";
  status: "all" | "affected" | "not-affected";
  showAcknowledged: boolean;
};
