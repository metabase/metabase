import { VersionInfoRecord } from "metabase-types/api";
import {
  createMockVersionInfo,
  createMockVersionInfoRecord,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import { WhatsNewNotification } from "./WhatsNewNotification";

const notification = () => screen.queryByText("See what's new");

const render = ({
  embedded = false,
  lastAcknowledged = null,
  currentVersion = "v0.48.0",
  versions = [
    createMockVersionInfoRecord({ version: "v0.48.1" }),
    createMockVersionInfoRecord({ version: "v0.48.0" }),
    createMockVersionInfoRecord({ version: "v0.47.0" }),
  ],
}: {
  embedded?: boolean;
  currentVersion?: string;
  lastAcknowledged?: string | null;
  versions?: VersionInfoRecord[];
}) => {
  jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(embedded);

  const versionMock = { tag: currentVersion };

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
      render({ currentVersion: "v0.48.0", lastAcknowledged: null });
      expect(notification()).toBeInTheDocument();
    });

    it("should show the notification if the last acknowledged version is the previous major", () => {
      render({ currentVersion: "v0.48.0", lastAcknowledged: "v0.47.0" });
      expect(notification()).toBeInTheDocument();
    });

    it("should show the notification if the last acknowledged version is more than 1 major old", () => {
      render({ currentVersion: "v0.48.0", lastAcknowledged: "v0.46.0" });
      expect(notification()).toBeInTheDocument();
    });

    it("should NOT show the notification in case of downgrades", () => {
      render({ currentVersion: "v0.47.0", lastAcknowledged: "v0.48.0" });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should NOT show the notification for a minor upgrade", () => {
      render({ currentVersion: "v0.48.1", lastAcknowledged: "v0.48.0" });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should NOT show the notification if the current version is not listed in version-info", () => {
      render({
        currentVersion: "v0.48.1 RC 1",
        lastAcknowledged: null,
        versions: [createMockVersionInfoRecord({ version: "v0.48.0" })],
      });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should NOT show the notification if metabase is embedded", () => {
      render({
        embedded: true,
        currentVersion: "v0.48.0",
        lastAcknowledged: null,
      });
      expect(notification()).not.toBeInTheDocument();
    });
  });

  describe("link behaviour", () => {
    it("should have target blank", () => {
      render({});
      expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
    });
  });
});
