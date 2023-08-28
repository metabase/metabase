import { createMockVersionInfoRecord } from "metabase-types/api/mocks";
import { getLatestEligibleReleaseNotes } from "./utils";

describe("What's new - utils", () => {
  describe("getLatestEligibleReleaseNotes", () => {
    it("doesn't filter old versions if lastAck is null", () => {
      expect(
        getLatestEligibleReleaseNotes({
          versions: [
            createMockVersionInfoRecord({ version: "v0.48" }),
            createMockVersionInfoRecord({
              version: "v0.43",
              announcement_url: "url",
            }),
          ],
          currentVersion: "v0.48",
          lastAcknowledgedVersion: null,
        }),
      ).toHaveProperty("version", "v0.43");
    });

    it("filters out ack versions", () => {
      expect(
        getLatestEligibleReleaseNotes({
          versions: [
            createMockVersionInfoRecord({
              version: "v0.47",
              announcement_url: "url",
            }),
          ],
          currentVersion: "v0.48",
          lastAcknowledgedVersion: "v0.47",
        }),
      ).toBe(undefined);

      expect(
        getLatestEligibleReleaseNotes({
          versions: [
            createMockVersionInfoRecord({
              version: "v0.46",
              announcement_url: "url",
            }),
          ],
          currentVersion: "v0.48",
          lastAcknowledgedVersion: "v0.47",
        }),
      ).toBe(undefined);
    });

    it("returns up to the current version", () => {
      expect(
        getLatestEligibleReleaseNotes({
          versions: [
            createMockVersionInfoRecord({
              version: "v0.48",
              announcement_url: "url",
            }),
          ],
          currentVersion: "v0.48",
          lastAcknowledgedVersion: "v0.47",
        }),
      ).not.toBe(undefined);
    });

    it("filters out future versions", () => {
      expect(
        getLatestEligibleReleaseNotes({
          versions: [
            createMockVersionInfoRecord({
              version: "v0.49",
              announcement_url: "url",
            }),
          ],
          currentVersion: "v0.48",
          lastAcknowledgedVersion: "v0.47",
        }),
      ).toBe(undefined);
    });

    it("returns last version if more than one are eligible", () => {
      expect(
        getLatestEligibleReleaseNotes({
          versions: [
            createMockVersionInfoRecord({
              version: "v0.49.2",
            }),
            createMockVersionInfoRecord({
              version: "v0.49.1",
              announcement_url: "url",
            }),
            createMockVersionInfoRecord({
              version: "v0.49.0",
              announcement_url: "url",
            }),
          ],
          currentVersion: "v0.49.2",
          lastAcknowledgedVersion: "v0.47",
        }),
      ).toHaveProperty("version", "v0.49.1");
    });
  });
});
