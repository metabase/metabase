export type SecurityAdvisorySpec = {
  advisory_id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  remediation: string;
  advisory_url?: string | null;
  affected_versions: { min: string; fixed: string }[];
  matching_query?: Record<string, string> | null;
  match_status: "unknown" | "active" | "resolved" | "not_affected" | "error";
  published_at: string;
  updated_at?: string;
};

export function seedSecurityAdvisories(
  advisories: SecurityAdvisorySpec[],
): Cypress.Chainable {
  return cy.request("POST", "/api/testing/security-advisories", {
    advisories,
  });
}
