import { compareVersions } from "metabase/utils/version";
import type { Advisory, AdvisorySeverity } from "metabase-types/api";

import type { AdvisoryFilter } from "./types";

const SEVERITY_ORDER: Record<AdvisorySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function isAffected(advisory: Advisory): boolean {
  return (
    advisory.match_status === "active" || advisory.match_status === "error"
  );
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

/**
 * Returns the highest `fixed` version across all active (unresolved) advisories,
 * which is the minimum version the instance should upgrade to.
 */
export function getTargetUpgradeVersion(advisories: Advisory[]): string | null {
  let target: string | null = null;

  for (const advisory of advisories) {
    if (!isAffected(advisory)) {
      continue;
    }
    for (const range of advisory.affected_versions) {
      if (target === null || compareVersions(range.fixed, target) === 1) {
        target = range.fixed;
      }
    }
  }

  return target;
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
