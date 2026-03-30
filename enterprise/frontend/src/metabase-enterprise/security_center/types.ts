export type AdvisorySeverity = "critical" | "high" | "medium" | "low";

export type Advisory = {
  id: string;
  title: string;
  description: string;
  severity: AdvisorySeverity;
  affectedVersionRange: string;
  fixedVersion: string;
  publishedAt: string;
  advisoryUrl: string;
  upgradeUrl: string;
  affected: boolean;
  acknowledged: boolean;
};

export type AdvisoryFilter = {
  severity: AdvisorySeverity | "all";
  status: "all" | "affected" | "not-affected";
  showAcknowledged: boolean;
};
