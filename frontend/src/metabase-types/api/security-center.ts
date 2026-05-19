export type AdvisoryMatchStatus =
  | "active"
  | "resolved"
  | "not_affected"
  | "error";

export type AdvisoryVersionRange = {
  min: string;
  fixed: string;
};

export type AdvisorySeverity = "critical" | "high" | "medium" | "low";

export type AdvisoryId = string;

export type Advisory = {
  advisory_id: AdvisoryId;
  title: string;
  severity: AdvisorySeverity;
  description: string;
  advisory_url: string | null;
  remediation: string;
  published_at: string;
  match_status: AdvisoryMatchStatus;
  last_evaluated_at: string | null;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
  affected_versions: AdvisoryVersionRange[];
};

export type ListAdvisoriesResponse = {
  last_checked_at: string | null;
  advisories: Advisory[];
};

export type AcknowledgeAdvisoryResponse = {
  advisory_id: string;
  match_status: AdvisoryMatchStatus;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
};

export type AcknowledgeAdvisoriesResponse = AcknowledgeAdvisoryResponse[];
