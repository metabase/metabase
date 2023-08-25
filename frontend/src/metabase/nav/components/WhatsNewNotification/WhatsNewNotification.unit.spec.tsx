import type { VersionInfoRecord } from "metabase-types/api";
import {
  createMockVersion,
  createMockVersionInfo,
  createMockVersionInfoRecord as mockVersion,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import { WhatsNewNotification } from "./WhatsNewNotification";

const notification = () => screen.queryByText("See what's new");

const setup = ({
  isEmbedded = false,
  lastAcknowledged = null,
  currentVersion = "v0.48.0",
  versions = [
    mockVersion({ version: "v0.48.1" }),
    mockVersion({
      version: "v0.48.0",
      releaseNotesUrl: "https://metabase.com/releases/48",
    }),
    mockVersion({ version: "v0.47.0" }),
  ],
}: {
  isEmbedded?: boolean;
  currentVersion?: string;
  lastAcknowledged?: string | null;
  versions?: VersionInfoRecord[];
}) => {
  jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(isEmbedded);

  const versionMock = createMockVersion({ tag: currentVersion });

  const [latest, ...older] = versions;
  const mockSettings = createMockSettingsState({
    version: versionMock,
    "version-info": createMockVersionInfo({ latest, older }),
    "last-acknowledged-version": lastAcknowledged,
  });

  return renderWithProviders(<WhatsNewNotification></WhatsNewNotification>, {
    storeInitialState: createMockState({ settings: mockSettings }),
  });
};

describe("WhatsNewNotification", () => {
  describe("display logic", () => {
    it("should show the notification if the last acknowledged version is null", () => {
      setup({ currentVersion: "v0.48.0", lastAcknowledged: null });
      expect(notification()).toBeInTheDocument();
    });

    it("should show the notification if the last acknowledged version is the previous major", () => {
      setup({ currentVersion: "v0.48.0", lastAcknowledged: "v0.47.0" });
      expect(notification()).toBeInTheDocument();
    });

    it("should NOT show the notification if the current version has been acknowledged", () => {
      setup({ currentVersion: "v0.48.0", lastAcknowledged: "v0.48.0" });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should NOT show the notification for releases older than the acknowledged one", () => {
      setup({
        currentVersion: "v0.48.0",
        lastAcknowledged: "v0.47.0",
        versions: [
          mockVersion({
            version: "v0.46.0",
            releaseNotesUrl: "https://metabase.com/releases/46",
          }),
        ],
      });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should show the notification if the last acknowledged version is more than 1 major old", () => {
      setup({ currentVersion: "v0.48.0", lastAcknowledged: "v0.46.0" });
      expect(notification()).toBeInTheDocument();
    });

    it("should NOT show the notification in case of downgrades (releaseNotesUrl only in the future releases)", () => {
      setup({ currentVersion: "v0.47.0", lastAcknowledged: "v0.48.0" });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should NOT show the notification for a minor upgrade that doesn't have a release url", () => {
      setup({ currentVersion: "v0.48.1", lastAcknowledged: "v0.48.0" });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should NOT show the notification if metabase is embedded", () => {
      setup({
        isEmbedded: true,
        currentVersion: "v0.48.0",
        lastAcknowledged: null,
      });
      expect(notification()).not.toBeInTheDocument();
    });
  });

  describe("link behaviour", () => {
    it("should have target blank", () => {
      setup({});
      expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
    });

    it("should link the most recent release if two versions have the release notes", () => {
      setup({
        currentVersion: "v0.48.0",
        lastAcknowledged: "v0.46.0",
        versions: [
          mockVersion({
            version: "v0.48.0",
            releaseNotesUrl: "https://metabase.com/releases/48",
          }),
          mockVersion({
            version: "v0.47.0",
            releaseNotesUrl: "https://metabase.com/releases/47",
          }),
        ],
      });

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://metabase.com/releases/48",
      );
    });
  });
});
