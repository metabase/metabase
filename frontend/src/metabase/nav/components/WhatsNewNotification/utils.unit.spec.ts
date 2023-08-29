import type {
  VersionInfo,
  VersionInfoRecord,
} from "metabase-types/api/settings";
import { createMockVersionInfoRecord as mockVersion } from "metabase-types/api/mocks";
import { getLatestEligibleReleaseNotes } from "./utils";

const buildVersionInfo = (versions: VersionInfoRecord[]): VersionInfo => {
  const [latest, ...older] = versions;
  return { latest, older };
};

const DEFAULTS: Parameters<typeof getLatestEligibleReleaseNotes>[0] = {
  isEmbedded: false,
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

  it("filters out future versions", () => {
    expect(
      getLatestEligibleReleaseNotes({
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

  it("returns last version if more than one are eligible", () => {
    expect(
      getLatestEligibleReleaseNotes({
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
});
