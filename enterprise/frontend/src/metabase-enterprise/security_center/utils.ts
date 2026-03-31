import type { Advisory, AdvisoryFilter, AdvisorySeverity } from "./types";

const SEVERITY_ORDER: Record<AdvisorySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function isAffected(advisory: Advisory): boolean {
  return advisory.match_status === "active";
}

export function isAcknowledged(advisory: Advisory): boolean {
  return advisory.acknowledged_at != null;
}

export function filterAdvisories(
  advisories: Advisory[],
  filter: AdvisoryFilter,
): Advisory[] {
  return advisories.filter((a) => {
    if (filter.severity !== "all" && a.severity !== filter.severity) {
      return false;
    }
    if (filter.status === "affected" && !isAffected(a)) {
      return false;
    }
    if (filter.status === "not-affected" && isAffected(a)) {
      return false;
    }
    if (!filter.showAcknowledged && isAcknowledged(a)) {
      return false;
    }
    return true;
  });
}

export function sortAdvisories(advisories: Advisory[]): Advisory[] {
  return [...advisories].sort((a, b) => {
    const aAffected = isAffected(a);
    const bAffected = isAffected(b);

    // Affected items first
    if (aAffected !== bAffected) {
      return aAffected ? -1 : 1;
    }

    // Then by severity (critical → low)
    const severityDiff =
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    // Then by published_at descending (newest first)
    return (
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );
  });
}
