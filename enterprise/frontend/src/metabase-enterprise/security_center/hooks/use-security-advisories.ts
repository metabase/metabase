import { useCallback, useState } from "react";

import type { Advisory } from "../types";

const INITIAL_ADVISORIES: Advisory[] = [
  {
    id: "SA-2026-001",
    title: "SQL injection in native query endpoint",
    description:
      "A SQL injection vulnerability was found in the native query execution endpoint that could allow authenticated users to execute arbitrary SQL commands beyond their permission scope.",
    severity: "critical",
    affectedVersionRange: ">=0.45.0 <0.59.4",
    fixedVersion: "v0.59.4",
    publishedAt: "2026-03-15T00:00:00Z",
    advisoryUrl:
      "https://github.com/metabase/metabase/security/advisories/SA-2026-001",
    upgradeUrl: "https://example.com/docs/latest/releases",
    affected: true,
    acknowledged: false,
  },
  {
    id: "SA-2026-002",
    title: "Cross-site scripting in dashboard text cards",
    description:
      "A stored XSS vulnerability was identified in dashboard text cards. An attacker with edit access could inject malicious scripts that execute when other users view the dashboard.",
    severity: "high",
    affectedVersionRange: ">=0.50.0 <0.59.2",
    fixedVersion: "v0.59.2",
    publishedAt: "2026-02-20T00:00:00Z",
    advisoryUrl:
      "https://github.com/metabase/metabase/security/advisories/SA-2026-002",
    upgradeUrl: "https://example.com/docs/latest/releases",
    affected: true,
    acknowledged: false,
  },
  {
    id: "SA-2026-003",
    title: "Information disclosure via API response headers",
    description:
      "Certain API responses included internal server configuration details in response headers, which could aid attackers in reconnaissance.",
    severity: "medium",
    affectedVersionRange: ">=0.40.0 <0.58.0",
    fixedVersion: "v0.58.0",
    publishedAt: "2026-01-10T00:00:00Z",
    advisoryUrl:
      "https://github.com/metabase/metabase/security/advisories/SA-2026-003",
    upgradeUrl: "https://example.com/docs/latest/releases",
    affected: false,
    acknowledged: false,
  },
  {
    id: "SA-2025-010",
    title: "CSRF token validation bypass on older browsers",
    description:
      "A CSRF token validation bypass was discovered that could be exploited on older browsers lacking SameSite cookie support, allowing cross-origin form submissions.",
    severity: "low",
    affectedVersionRange: ">=0.42.0 <0.57.0",
    fixedVersion: "v0.57.0",
    publishedAt: "2025-11-05T00:00:00Z",
    advisoryUrl:
      "https://github.com/metabase/metabase/security/advisories/SA-2025-010",
    upgradeUrl: "https://example.com/docs/latest/releases",
    affected: false,
    acknowledged: true,
  },
];

export function useSecurityAdvisories() {
  const [data, setData] = useState<Advisory[]>(INITIAL_ADVISORIES);

  // TODO: replace with RTK Query mutation (e.g. PUT /api/ee/security-center/advisories/:id/acknowledge)
  const acknowledgeAdvisory = useCallback((advisoryId: string) => {
    setData((prev) =>
      prev.map((a) => (a.id === advisoryId ? { ...a, acknowledged: true } : a)),
    );
  }, []);

  return {
    data,
    isLoading: false,
    acknowledgeAdvisory,
  };
}
