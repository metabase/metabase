import type { Advisory, AdvisoryFilter, AdvisorySeverity } from "./types";

const SEVERITY_ORDER: Record<AdvisorySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function filterAdvisories(
  advisories: Advisory[],
  filter: AdvisoryFilter,
): Advisory[] {
  return advisories.filter((a) => {
    if (filter.severity !== "all" && a.severity !== filter.severity) {
      return false;
    }
    if (filter.status === "affected" && !a.affected) {
      return false;
    }
    if (filter.status === "not-affected" && a.affected) {
      return false;
    }
    if (!filter.showAcknowledged && a.acknowledged) {
      return false;
    }
    return true;
  });
}

export function sortAdvisories(advisories: Advisory[]): Advisory[] {
  return [...advisories].sort((a, b) => {
    // Affected items first
    if (a.affected !== b.affected) {
      return a.affected ? -1 : 1;
    }

    // Then by severity (critical → low)
    const severityDiff =
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    // Then by publishedAt descending (newest first)
    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });
}
