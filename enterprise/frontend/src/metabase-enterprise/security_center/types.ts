import type { AdvisorySeverity } from "metabase-types/api";

export type AdvisoryFilter = {
  severity: AdvisorySeverity | "all";
  status: "all" | "affected" | "not-affected";
  showAcknowledged: boolean;
};
