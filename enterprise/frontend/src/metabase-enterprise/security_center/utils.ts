import type { Advisory, AdvisorySeverity } from "metabase-types/api";

const SEVERITY_ORDER: Record<AdvisorySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const compareBySeverity = (
  a: { severity: AdvisorySeverity },
  b: { severity: AdvisorySeverity },
) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

export function isAffected(advisory: Advisory): boolean {
  return (
    advisory.match_status === "active" || advisory.match_status === "error"
  );
}
