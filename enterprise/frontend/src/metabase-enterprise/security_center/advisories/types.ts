import type { AdvisorySeverity } from "metabase-types/api";

export type AdvisoryFilter = {
  severity: AdvisorySeverity | "all";
  showAcknowledged: boolean;
};
