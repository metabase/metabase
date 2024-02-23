import { createMockVersionInfoRecord as mockVersion } from "metabase-types/api/mocks";
import type {
  VersionInfo,
  VersionInfoRecord,
} from "metabase-types/api/settings";

import { getLatestEligibleReleaseNotes } from "./utils";

const buildVersionInfo = (versions: VersionInfoRecord[]): VersionInfo => {
  const [latest, ...older] = versions;
  return { latest, older };
};

// these args make should make the notification to appear
const DEFAULTS: Parameters<typeof getLatestEligibleReleaseNotes>[0] = {
  isEmbedded: false,
  isWhiteLabeling: false,
  lastAcknowledgedVersion: null,
  currentVersion: "v0.48.0",
  versionInfo: buildVersionInfo([
    mockVersion({ version: "v0.48.2" }),
    mockVersion({ version: "v0.48.1" }),
    mockVersion({
      version: "v0.48.0",
      announcement_url: "https://metabase.com/releases/48",
    }),
    mockVersion({ version: "v0.47.0" }),
  ]),
};

describe("getLatestEligibleReleaseNotes", () => {
  it("returns the latest eligible version when all conditions are satisfied", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
      }),
    ).toHaveProperty("version", "v0.48.0");
  });

  it("should return nothing when embedded, even if other conditions are satisfied", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        isEmbedded: true,
      }),
    ).toBe(undefined);
  });

  it("should return nothing when white labeling, even if other conditions are satisfied", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        isWhiteLabeling: true,
      }),
    ).toBe(undefined);
  });

  it("should ignore versions without the annoucement_url", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        currentVersion: "v0.48.2",
        versionInfo: buildVersionInfo([
          mockVersion({ version: "v0.48.2" }),
          mockVersion({ version: "v0.48.1" }),
          mockVersion({
            version: "v0.48.0",
            announcement_url: "https://metabase.com/releases/48",
          }),
          mockVersion({ version: "v0.47.0" }),
        ]),
      }),
    ).toHaveProperty("version", "v0.48.0");
  });

  it("doesn't filter old versions if lastAck is null", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        versionInfo: buildVersionInfo([
          mockVersion({ version: "v0.48.0" }),
          mockVersion({
            version: "v0.43.0",
            announcement_url: "url",
          }),
        ]),
        lastAcknowledgedVersion: null,
      }),
    ).toHaveProperty("version", "v0.43.0");
  });

  it("filters out acknowledged versions", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        versionInfo: buildVersionInfo([
          mockVersion({
            version: "v0.48.0",
          }),
          mockVersion({
            version: "v0.47.0",
            announcement_url: "url",
          }),
          mockVersion({
            version: "v0.46.1",
            announcement_url: "url",
          }),
        ]),
        lastAcknowledgedVersion: "v0.47.0",
      }),
    ).toBe(undefined);
  });

  it("returns up to the current version", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        versionInfo: buildVersionInfo([
          mockVersion({
            version: "v0.48.0",
            announcement_url: "url",
          }),
        ]),
        currentVersion: "v0.48.0",
      }),
    ).toHaveProperty("version", "v0.48.0");
  });

  it("filters out future versions - lastAcknowledgedVersion not null", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        versionInfo: buildVersionInfo([
          mockVersion({
            version: "v0.49.0",
            announcement_url: "url",
          }),
          mockVersion({
            version: "v0.48.0",
          }),
        ]),
        currentVersion: "v0.48.0",
        lastAcknowledgedVersion: "v0.47.0",
      }),
    ).toBe(undefined);
  });

  it("filters out future versions - lastAcknowledgedVersion  null", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        versionInfo: buildVersionInfo([
          mockVersion({
            version: "v0.49.0",
            announcement_url: "url",
          }),
          mockVersion({
            version: "v0.48.0",
          }),
        ]),
        currentVersion: "v0.48.0",
        lastAcknowledgedVersion: null,
      }),
    ).toBe(undefined);
  });

  it("returns last version if more than one are eligible", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        versionInfo: buildVersionInfo([
          mockVersion({
            version: "v0.49.2",
          }),
          mockVersion({
            version: "v0.49.1",
            announcement_url: "url",
          }),
          mockVersion({
            version: "v0.49.0",
            announcement_url: "url",
          }),
        ]),
        currentVersion: "v0.49.2",
        lastAcknowledgedVersion: "v0.47",
      }),
    ).toHaveProperty("version", "v0.49.1");
  });

  it("returns last version if more than one is eligible - versions not in order", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        versionInfo: buildVersionInfo([
          mockVersion({
            version: "v0.49.0",
            announcement_url: "url",
          }),
          mockVersion({
            version: "v0.49.2",
          }),
          mockVersion({
            version: "v0.49.1",
            announcement_url: "url",
          }),
        ]),
        currentVersion: "v0.49.2",
        lastAcknowledgedVersion: "v0.47",
      }),
    ).toHaveProperty("version", "v0.49.1");
  });

  it("should return undefined when the current version is not defined", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        currentVersion: undefined,
      }),
    ).toBe(undefined);
  });

  it("should return undefined if the current version is not in version-info, for example for RCs", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        currentVersion: "v0.48.0-RC",
      }),
    ).toBe(undefined);
  });

  it("should not crash with vUNKNOWN versions", () => {
    expect(
      getLatestEligibleReleaseNotes({
        ...DEFAULTS,
        currentVersion: "vUNKNOWN",
      }),
    ).toBe(undefined);
  });
});
