import {
  type Advisory,
  type AdvisoryGithub,
  DEFAULT_ALERT_MESSAGE_TEMPLATE,
  advisoryToRanges,
  assertValidAlertUpgradeVersions,
  buildMessage,
  diffAlertUpgradeVersions,
  fetchAdvisory,
  isAlertUpgradeVersion,
  normalizeAdvisoryVersion,
  parseGhsaId,
  toEditionEntry,
  upsertAlertUpgradeVersions,
} from "./alert-upgrade-versions";
import type { VersionInfoFile } from "./types";

const sampleVersionInfo = (): VersionInfoFile => ({
  latest: {
    version: "v0.63.10",
    released: "2026-01-01",
    patch: true,
    highlights: [],
  },
  older: [],
});

const ghsaAdvisory = (): Advisory => ({
  id: "GHSA-r495-55cx-fjh7",
  html_url:
    "https://github.com/metabase/metabase/security/advisories/GHSA-r495-55cx-fjh7",
  severity: "critical",
  summary: "Multiple vulnerabilities",
  vulnerabilities: [
    {
      vulnerable_version_range: ">= x.58.0, < x.58.28",
      patched_versions: "x.58.28",
    },
    {
      vulnerable_version_range: ">= x.59.0, < x.59.25",
      patched_versions: "x.59.25",
    },
    {
      vulnerable_version_range: ">= x.63.0, < x.63.10",
      patched_versions: "x.63.10",
    },
    {
      vulnerable_version_range: "< x.58.28",
      patched_versions: "x.58.28",
    },
  ],
});

describe("alert-upgrade-versions", () => {
  describe("parseGhsaId", () => {
    it("accepts a bare GHSA id", () => {
      expect(parseGhsaId("GHSA-r495-55cx-fjh7")).toEqual("GHSA-r495-55cx-fjh7");
    });

    it("accepts a repository advisory URL", () => {
      expect(
        parseGhsaId(
          "https://github.com/metabase/metabase/security/advisories/GHSA-r495-55cx-fjh7",
        ),
      ).toEqual("GHSA-r495-55cx-fjh7");
    });

    it("accepts the github.com/advisories URL", () => {
      expect(
        parseGhsaId("https://github.com/advisories/GHSA-r495-55cx-fjh7"),
      ).toEqual("GHSA-r495-55cx-fjh7");
    });

    it("normalizes case", () => {
      expect(parseGhsaId("ghsa-R495-55CX-FJH7")).toEqual("GHSA-r495-55cx-fjh7");
    });

    it("rejects non-GHSA input", () => {
      expect(() => parseGhsaId("CVE-2026-1234")).toThrow(
        /Not a GHSA id or advisory URL/,
      );
    });
  });

  describe("normalizeAdvisoryVersion", () => {
    it("normalizes x. / 0. / 1. / v0. / v1. prefixes to v0.", () => {
      expect(normalizeAdvisoryVersion("x.63.10")).toEqual("v0.63.10");
      expect(normalizeAdvisoryVersion("0.63.10")).toEqual("v0.63.10");
      expect(normalizeAdvisoryVersion("1.63.10")).toEqual("v0.63.10");
      expect(normalizeAdvisoryVersion("v0.63.10")).toEqual("v0.63.10");
      expect(normalizeAdvisoryVersion("v1.63.10")).toEqual("v0.63.10");
    });

    it("rejects unparseable versions", () => {
      expect(() => normalizeAdvisoryVersion("latest")).toThrow(
        /Cannot normalize version/,
      );
    });
  });

  describe("fetchAdvisory", () => {
    it("maps a repository advisory response", async () => {
      const getRepositoryAdvisory = jest.fn().mockResolvedValue({
        data: {
          ghsa_id: "GHSA-r495-55cx-fjh7",
          html_url:
            "https://github.com/metabase/metabase/security/advisories/GHSA-r495-55cx-fjh7",
          severity: "critical",
          summary: "Multiple vulnerabilities",
          vulnerabilities: [
            {
              vulnerable_version_range: ">= x.63.0, < x.63.10",
              patched_versions: "x.63.10",
            },
          ],
        },
      });
      const github: AdvisoryGithub = {
        rest: { securityAdvisories: { getRepositoryAdvisory } },
      };

      await expect(
        fetchAdvisory({
          github,
          owner: "metabase",
          repo: "metabase",
          ghsaId: "GHSA-r495-55cx-fjh7",
        }),
      ).resolves.toEqual({
        id: "GHSA-r495-55cx-fjh7",
        html_url:
          "https://github.com/metabase/metabase/security/advisories/GHSA-r495-55cx-fjh7",
        severity: "critical",
        summary: "Multiple vulnerabilities",
        vulnerabilities: [
          {
            vulnerable_version_range: ">= x.63.0, < x.63.10",
            patched_versions: "x.63.10",
          },
        ],
      });

      expect(getRepositoryAdvisory).toHaveBeenCalledWith({
        owner: "metabase",
        repo: "metabase",
        ghsa_id: "GHSA-r495-55cx-fjh7",
      });
    });

    it("falls back to first_patched_version.identifier", async () => {
      const github: AdvisoryGithub = {
        rest: {
          securityAdvisories: {
            getRepositoryAdvisory: jest.fn().mockResolvedValue({
              data: {
                ghsa_id: "GHSA-aaaa-bbbb-cccc",
                html_url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
                severity: "high",
                summary: "example",
                vulnerabilities: [
                  {
                    vulnerable_version_range: "< 0.63.10",
                    first_patched_version: { identifier: "0.63.10" },
                  },
                ],
              },
            }),
          },
        },
      };

      const advisory = await fetchAdvisory({
        github,
        owner: "metabase",
        repo: "metabase",
        ghsaId: "GHSA-aaaa-bbbb-cccc",
      });

      expect(advisory.vulnerabilities[0].patched_versions).toEqual("0.63.10");
    });
  });

  describe("advisoryToRanges", () => {
    it("parses GHSA-style ranges and collapses the catch-all row", () => {
      const { ranges, warnings } = advisoryToRanges(ghsaAdvisory());

      expect(ranges).toEqual([
        { min: "v0.0.0", fixed: "v0.58.28" },
        { min: "v0.59.0", fixed: "v0.59.25" },
        { min: "v0.63.0", fixed: "v0.63.10" },
      ]);
      expect(warnings).toEqual([
        expect.stringMatching(/Collapsed 4 vulnerability ranges into 3/),
      ]);
    });

    it("uses < bound when patched_versions is absent", () => {
      const { ranges } = advisoryToRanges({
        ...ghsaAdvisory(),
        vulnerabilities: [
          {
            vulnerable_version_range: ">= x.63.0, < x.63.10",
            patched_versions: null,
          },
        ],
      });

      expect(ranges).toEqual([{ min: "v0.63.0", fixed: "v0.63.10" }]);
    });

    it("warns when patched_versions disagrees with the < bound", () => {
      const { ranges, warnings } = advisoryToRanges({
        ...ghsaAdvisory(),
        vulnerabilities: [
          {
            vulnerable_version_range: ">= x.63.0, < x.63.9",
            patched_versions: "x.63.10",
          },
        ],
      });

      expect(ranges).toEqual([{ min: "v0.63.0", fixed: "v0.63.10" }]);
      expect(warnings).toEqual([
        expect.stringMatching(/disagrees with < bound v0\.63\.9/),
      ]);
    });

    it("collapses oss/ee prefix duplicates to one edition-agnostic range", () => {
      const { ranges } = advisoryToRanges({
        ...ghsaAdvisory(),
        vulnerabilities: [
          {
            vulnerable_version_range: ">= 0.63.0, < 0.63.10",
            patched_versions: "0.63.10",
          },
          {
            vulnerable_version_range: ">= 1.63.0, < 1.63.10",
            patched_versions: "1.63.10",
          },
        ],
      });

      expect(ranges).toEqual([{ min: "v0.63.0", fixed: "v0.63.10" }]);
    });

    it("errors on <= / = ranges without a patched version", () => {
      expect(() =>
        advisoryToRanges({
          ...ghsaAdvisory(),
          vulnerabilities: [
            {
              vulnerable_version_range: "<= x.63.9",
              patched_versions: null,
            },
          ],
        }),
      ).toThrow(/pass --min and --fixed instead/);

      expect(() =>
        advisoryToRanges({
          ...ghsaAdvisory(),
          vulnerabilities: [
            {
              vulnerable_version_range: "= x.63.9",
              patched_versions: null,
            },
          ],
        }),
      ).toThrow(/pass --min and --fixed instead/);
    });

    it("uses patched version for <= ranges when present", () => {
      const { ranges } = advisoryToRanges({
        ...ghsaAdvisory(),
        vulnerabilities: [
          {
            vulnerable_version_range: ">= x.63.0, <= x.63.9",
            patched_versions: "x.63.10",
          },
        ],
      });

      expect(ranges).toEqual([{ min: "v0.63.0", fixed: "v0.63.10" }]);
    });

    it("errors when there are no vulnerabilities", () => {
      expect(() =>
        advisoryToRanges({ ...ghsaAdvisory(), vulnerabilities: [] }),
      ).toThrow(/pass --min and --fixed instead/);
    });
  });

  describe("toEditionEntry", () => {
    it("applies v0. / v1. prefixes", () => {
      const range = { min: "x.63.0", fixed: "x.63.10" };

      expect(toEditionEntry(range, "oss", "upgrade")).toEqual({
        min: "v0.63.0",
        fixed: "v0.63.10",
        message: "upgrade",
      });
      expect(toEditionEntry(range, "ee", "upgrade")).toEqual({
        min: "v1.63.0",
        fixed: "v1.63.10",
        message: "upgrade",
      });
    });
  });

  describe("buildMessage", () => {
    it("substitutes fixed, severity, and url in the default template", () => {
      const message = buildMessage({
        fixed: "1.63.10",
        severity: "critical",
        url: "https://example.com",
      });

      expect(message).toContain("critical security vulnerability");
      expect(message).toContain("Upgrade to 1.63.10 or later");
      expect(message).not.toContain("{fixed}");
      expect(message).not.toContain("{severity}");
    });

    it("uses --message as a template override", () => {
      expect(
        buildMessage({
          template: "See {url} and upgrade to {fixed} ({severity})",
          fixed: "0.63.10",
          severity: "high",
          url: "https://ghsa.example",
        }),
      ).toEqual("See https://ghsa.example and upgrade to 0.63.10 (high)");
    });

    it("matches the UpgradeBanner stub wording", () => {
      expect(DEFAULT_ALERT_MESSAGE_TEMPLATE).toContain(
        "View upgrade instructions",
      );
      expect(DEFAULT_ALERT_MESSAGE_TEMPLATE).toContain("{fixed}");
      expect(DEFAULT_ALERT_MESSAGE_TEMPLATE).toContain("{severity}");
    });
  });

  describe("upsertAlertUpgradeVersions", () => {
    it("appends without an id and sorts by min", () => {
      const first = upsertAlertUpgradeVersions(sampleVersionInfo(), [
        {
          min: "v0.63.0",
          fixed: "v0.63.10",
          message: "later",
        },
      ]);
      const result = upsertAlertUpgradeVersions(first, [
        {
          min: "v0.58.0",
          fixed: "v0.58.28",
          message: "earlier",
        },
      ]);

      expect(result.alert_upgrade_versions?.map((entry) => entry.min)).toEqual([
        "v0.58.0",
        "v0.63.0",
      ]);
      expect(result.latest).toEqual(sampleVersionInfo().latest);
    });

    it("replaces existing entries with the same id", () => {
      const withOld = upsertAlertUpgradeVersions(
        sampleVersionInfo(),
        [
          {
            min: "v0.63.0",
            fixed: "v0.63.9",
            message: "old",
            id: "GHSA-r495-55cx-fjh7",
          },
          {
            min: "v0.50.0",
            fixed: "v0.50.1",
            message: "other",
            id: "other-id",
          },
        ],
        "GHSA-r495-55cx-fjh7",
      );

      const result = upsertAlertUpgradeVersions(
        withOld,
        [
          {
            min: "v0.63.0",
            fixed: "v0.63.10",
            message: "new",
            id: "GHSA-r495-55cx-fjh7",
          },
        ],
        "GHSA-r495-55cx-fjh7",
      );

      expect(result.alert_upgrade_versions).toEqual([
        {
          min: "v0.50.0",
          fixed: "v0.50.1",
          message: "other",
          id: "other-id",
        },
        {
          min: "v0.63.0",
          fixed: "v0.63.10",
          message: "new",
          id: "GHSA-r495-55cx-fjh7",
        },
      ]);
    });
  });

  describe("diffAlertUpgradeVersions", () => {
    it("reports added, removed, and changed entries", () => {
      const remote: VersionInfoFile = {
        ...sampleVersionInfo(),
        alert_upgrade_versions: [
          { min: "v0.58.0", fixed: "v0.58.28", message: "keep" },
          { min: "v0.59.0", fixed: "v0.59.25", message: "old" },
          { min: "v0.60.0", fixed: "v0.60.1", message: "gone" },
        ],
      };
      const local: VersionInfoFile = {
        ...sampleVersionInfo(),
        alert_upgrade_versions: [
          { min: "v0.58.0", fixed: "v0.58.28", message: "keep" },
          { min: "v0.59.0", fixed: "v0.59.25", message: "new" },
          { min: "v0.63.0", fixed: "v0.63.10", message: "added" },
        ],
      };

      expect(diffAlertUpgradeVersions(remote, local)).toEqual({
        added: [{ min: "v0.63.0", fixed: "v0.63.10", message: "added" }],
        removed: [{ min: "v0.60.0", fixed: "v0.60.1", message: "gone" }],
        changed: [
          {
            from: { min: "v0.59.0", fixed: "v0.59.25", message: "old" },
            to: { min: "v0.59.0", fixed: "v0.59.25", message: "new" },
          },
        ],
        otherKeysDiffer: false,
      });
    });

    it("flags when a non-alert_upgrade_versions key differs", () => {
      const remote = sampleVersionInfo();
      const local: VersionInfoFile = {
        ...remote,
        latest: { ...remote.latest, version: "v0.64.0" },
      };

      expect(diffAlertUpgradeVersions(remote, local).otherKeysDiffer).toBe(
        true,
      );
    });
  });

  describe("isAlertUpgradeVersion / assertValidAlertUpgradeVersions", () => {
    it("accepts optional id", () => {
      expect(
        isAlertUpgradeVersion({
          min: "v0.63.0",
          fixed: "v0.63.10",
          message: "go",
        }),
      ).toBe(true);
      expect(
        isAlertUpgradeVersion({
          min: "v0.63.0",
          fixed: "v0.63.10",
          message: "go",
          id: "GHSA-r495-55cx-fjh7",
        }),
      ).toBe(true);
    });

    it("rejects fixed <= min", () => {
      expect(() =>
        assertValidAlertUpgradeVersions([
          { min: "v0.63.10", fixed: "v0.63.10", message: "same" },
        ]),
      ).toThrow(/fixed must be greater than min/);
      expect(() =>
        assertValidAlertUpgradeVersions([
          { min: "v0.63.10", fixed: "v0.63.0", message: "backwards" },
        ]),
      ).toThrow(/fixed must be greater than min/);
    });
  });
});
