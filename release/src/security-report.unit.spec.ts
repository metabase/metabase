import type {
  CodeScanningAlert,
  DependabotAlert,
  SecurityAlert,
  SecurityReportData,
} from "./security-report";
import {
  calculateAgeDays,
  categorizeAlerts,
  filterAlertsBySinceDate,
  formatAlertSection,
  formatDismissedAlert,
  formatFixedAlert,
  formatOpenAlert,
  generateSecurityReport,
  mapDismissedReason,
  normalizeCodeScanningAlert,
  normalizeDependabotAlert,
} from "./security-report";

describe("Security Report", () => {
  describe("mapDismissedReason", () => {
    it("should map false positive reasons correctly", () => {
      expect(mapDismissedReason("not_used")).toBe("false positive");
      expect(mapDismissedReason("inaccurate")).toBe("false positive");
      expect(mapDismissedReason("auto_dismissed")).toBe("false positive");
      expect(mapDismissedReason("false positive")).toBe("false positive");
      expect(mapDismissedReason("used in tests")).toBe("false positive");
    });

    it("should map true positive reasons correctly", () => {
      expect(mapDismissedReason("tolerable_risk")).toBe("true positive");
      expect(mapDismissedReason("no_bandwidth")).toBe("true positive");
      expect(mapDismissedReason("fix_started")).toBe("true positive");
      expect(mapDismissedReason("won't fix")).toBe("true positive");
    });

    it("should return unknown for null or unrecognized reasons", () => {
      expect(mapDismissedReason(null)).toBe("unknown");
      expect(mapDismissedReason("some_other_reason")).toBe("unknown");
    });
  });

  describe("calculateAgeDays", () => {
    it("should calculate age in days correctly", () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now);
      fiveDaysAgo.setDate(now.getDate() - 5);

      const age = calculateAgeDays(fiveDaysAgo.toISOString());
      expect(age).toBe(5);
    });

    it("should return 0 for today", () => {
      const now = new Date();
      const age = calculateAgeDays(now.toISOString());
      expect(age).toBe(0);
    });
  });

  describe("normalizeDependabotAlert", () => {
    it("should normalize a dependabot alert with CVE", () => {
      const alert: DependabotAlert = {
        number: 123,
        state: "open",
        security_advisory: {
          cve_id: "CVE-2024-1234",
          ghsa_id: "GHSA-xxxx-yyyy",
          summary: "Test vulnerability",
        },
        html_url: "https://github.com/test/repo/security/dependabot/123",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        fixed_at: null,
        dismissed_at: null,
        dismissed_reason: null,
        dismissed_comment: null,
      };

      const normalized = normalizeDependabotAlert(alert);

      expect(normalized.id).toBe("CVE-2024-1234");
      expect(normalized.description).toBe("Test vulnerability");
      expect(normalized.state).toBe("open");
      expect(normalized.source).toBe("dependabot");
    });

    it("should use GHSA ID when CVE is null", () => {
      const alert: DependabotAlert = {
        number: 123,
        state: "open",
        security_advisory: {
          cve_id: null,
          ghsa_id: "GHSA-xxxx-yyyy",
          summary: "Test vulnerability",
        },
        html_url: "https://github.com/test/repo/security/dependabot/123",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        fixed_at: null,
        dismissed_at: null,
        dismissed_reason: null,
        dismissed_comment: null,
      };

      const normalized = normalizeDependabotAlert(alert);
      expect(normalized.id).toBe("GHSA-xxxx-yyyy");
    });

    it("should normalize auto_dismissed state to dismissed", () => {
      const alert: DependabotAlert = {
        number: 123,
        state: "auto_dismissed",
        security_advisory: {
          cve_id: "CVE-2024-1234",
          ghsa_id: "GHSA-xxxx-yyyy",
          summary: "Test vulnerability",
        },
        html_url: "https://github.com/test/repo/security/dependabot/123",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        fixed_at: null,
        dismissed_at: null,
        dismissed_reason: null,
        dismissed_comment: null,
      };

      const normalized = normalizeDependabotAlert(alert);

      expect(normalized.state).toBe("dismissed");
      expect(normalized.dismissedReason).toBe("auto_dismissed");
      expect(normalized.dismissedComment).toBe(
        "Auto-dismissed (dev dependency)",
      );
    });
  });

  describe("normalizeCodeScanningAlert", () => {
    it("should normalize a code scanning alert", () => {
      const alert: CodeScanningAlert = {
        number: 456,
        state: "fixed",
        rule: {
          id: "SNYK-JS-LODASH-12345",
          description: "Prototype Pollution vulnerability",
        },
        tool: {
          name: "Snyk Open Source",
        },
        html_url: "https://github.com/test/repo/security/code-scanning/456",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        fixed_at: "2024-01-02T00:00:00Z",
        dismissed_at: null,
        dismissed_reason: null,
        dismissed_comment: null,
      };

      const normalized = normalizeCodeScanningAlert(alert);

      expect(normalized.id).toBe("SNYK-JS-LODASH-12345");
      expect(normalized.description).toBe("Prototype Pollution vulnerability");
      expect(normalized.state).toBe("fixed");
      expect(normalized.source).toBe("code-scanning");
    });
  });

  describe("filterAlertsBySinceDate", () => {
    it("should filter alerts by since date", () => {
      const alerts: SecurityAlert[] = [
        {
          id: "CVE-1",
          url: "https://example.com/1",
          description: "Old alert",
          state: "fixed",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-05T00:00:00Z",
          source: "dependabot",
        },
        {
          id: "CVE-2",
          url: "https://example.com/2",
          description: "Recent alert",
          state: "fixed",
          createdAt: "2024-01-10T00:00:00Z",
          updatedAt: "2024-01-15T00:00:00Z",
          source: "dependabot",
        },
      ];

      const filtered = filterAlertsBySinceDate(alerts, "2024-01-10");

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("CVE-2");
    });
  });

  describe("categorizeAlerts", () => {
    const alerts: SecurityAlert[] = [
      {
        id: "CVE-OPEN",
        url: "https://example.com/open",
        description: "Open alert",
        state: "open",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        source: "dependabot",
      },
      {
        id: "CVE-FIXED-OLD",
        url: "https://example.com/fixed-old",
        description: "Old fixed alert",
        state: "fixed",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-05T00:00:00Z",
        source: "dependabot",
      },
      {
        id: "CVE-FIXED-NEW",
        url: "https://example.com/fixed-new",
        description: "New fixed alert",
        state: "fixed",
        createdAt: "2024-01-10T00:00:00Z",
        updatedAt: "2024-01-15T00:00:00Z",
        source: "dependabot",
      },
      {
        id: "CVE-DISMISSED",
        url: "https://example.com/dismissed",
        description: "Dismissed alert",
        state: "dismissed",
        createdAt: "2024-01-10T00:00:00Z",
        updatedAt: "2024-01-12T00:00:00Z",
        dismissedReason: "not_used",
        source: "dependabot",
      },
    ];

    it("should categorize alerts correctly without date filter", () => {
      const result = categorizeAlerts(alerts);

      expect(result.open).toHaveLength(1);
      expect(result.fixed).toHaveLength(2);
      expect(result.dismissed).toHaveLength(1);
    });

    it("should categorize alerts with date filter (open unaffected)", () => {
      const result = categorizeAlerts(alerts, "2024-01-10");

      expect(result.open).toHaveLength(1); // Open is never filtered
      expect(result.fixed).toHaveLength(1); // Only new fixed
      expect(result.dismissed).toHaveLength(1);
    });
  });

  describe("formatOpenAlert", () => {
    it("should format an open alert with age", () => {
      const now = new Date();
      const tenDaysAgo = new Date(now);
      tenDaysAgo.setDate(now.getDate() - 10);

      const alert: SecurityAlert = {
        id: "CVE-2024-1234",
        url: "https://github.com/test/repo/security/123",
        description: "Test vulnerability",
        state: "open",
        createdAt: tenDaysAgo.toISOString(),
        updatedAt: tenDaysAgo.toISOString(),
        source: "dependabot",
      };

      const formatted = formatOpenAlert(alert);

      expect(formatted).toBe(
        "- [CVE-2024-1234](https://github.com/test/repo/security/123): Test vulnerability: 10 days old",
      );
    });
  });

  describe("formatFixedAlert", () => {
    it("should format a fixed alert", () => {
      const alert: SecurityAlert = {
        id: "CVE-2024-1234",
        url: "https://github.com/test/repo/security/123",
        description: "Test vulnerability",
        state: "fixed",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        source: "dependabot",
      };

      const formatted = formatFixedAlert(alert);

      expect(formatted).toBe(
        "- [CVE-2024-1234](https://github.com/test/repo/security/123): Test vulnerability",
      );
    });
  });

  describe("formatDismissedAlert", () => {
    it("should format a dismissed alert with reason", () => {
      const alert: SecurityAlert = {
        id: "CVE-2024-1234",
        url: "https://github.com/test/repo/security/123",
        description: "Test vulnerability",
        state: "dismissed",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        dismissedReason: "not_used",
        dismissedComment: "Not used in production",
        source: "dependabot",
      };

      const formatted = formatDismissedAlert(alert);

      expect(formatted).toBe(
        "- [CVE-2024-1234](https://github.com/test/repo/security/123): false positive: Not used in production",
      );
    });

    it("should use dismissed reason when no comment", () => {
      const alert: SecurityAlert = {
        id: "CVE-2024-1234",
        url: "https://github.com/test/repo/security/123",
        description: "Test vulnerability",
        state: "dismissed",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        dismissedReason: "tolerable_risk",
        source: "dependabot",
      };

      const formatted = formatDismissedAlert(alert);

      expect(formatted).toBe(
        "- [CVE-2024-1234](https://github.com/test/repo/security/123): true positive: tolerable_risk",
      );
    });
  });

  describe("formatAlertSection", () => {
    it("should return empty message when no alerts", () => {
      const result = formatAlertSection([], formatFixedAlert, "No alerts");
      expect(result).toBe("No alerts");
    });

    it("should deduplicate identical formatted alerts", () => {
      const alerts: SecurityAlert[] = [
        {
          id: "CVE-2024-1234",
          url: "https://github.com/test/repo/security/123",
          description: "Test vulnerability",
          state: "fixed",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          source: "dependabot",
        },
        {
          id: "CVE-2024-1234",
          url: "https://github.com/test/repo/security/123",
          description: "Test vulnerability",
          state: "fixed",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          source: "code-scanning",
        },
      ];

      const result = formatAlertSection(alerts, formatFixedAlert, "No alerts");
      const lines = result.split("\n");

      expect(lines).toHaveLength(1);
    });

    it("should sort alerts by ID descending", () => {
      const alerts: SecurityAlert[] = [
        {
          id: "CVE-A",
          url: "https://example.com/a",
          description: "Alert A",
          state: "fixed",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          source: "dependabot",
        },
        {
          id: "CVE-Z",
          url: "https://example.com/z",
          description: "Alert Z",
          state: "fixed",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          source: "dependabot",
        },
      ];

      const result = formatAlertSection(alerts, formatFixedAlert, "No alerts");
      const lines = result.split("\n");

      expect(lines[0]).toContain("CVE-Z");
      expect(lines[1]).toContain("CVE-A");
    });
  });

  describe("generateSecurityReport", () => {
    it("should generate a complete report", () => {
      const data: SecurityReportData = {
        open: [
          {
            id: "CVE-OPEN",
            url: "https://example.com/open",
            description: "Open vulnerability",
            state: "open",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: "dependabot",
          },
        ],
        fixed: [
          {
            id: "CVE-FIXED",
            url: "https://example.com/fixed",
            description: "Fixed vulnerability",
            state: "fixed",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-02T00:00:00Z",
            source: "dependabot",
          },
        ],
        dismissed: [],
      };

      const report = generateSecurityReport(data, "2024-01-15");

      expect(report).toContain("# 2024-01-15");
      expect(report).toContain("## Open");
      expect(report).toContain("[CVE-OPEN]");
      expect(report).toContain("## Fixed");
      expect(report).toContain("[CVE-FIXED]");
      expect(report).toContain("## Dismissed");
      expect(report).toContain("No events in the selected period");
    });

    it("should show 'No open alerts' when no open alerts", () => {
      const data: SecurityReportData = {
        open: [],
        fixed: [],
        dismissed: [],
      };

      const report = generateSecurityReport(data, "2024-01-15");

      expect(report).toContain("No open alerts");
    });
  });
});
