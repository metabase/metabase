import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import type { VersionInfoRecord } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockVersion,
  createMockVersionInfo,
  createMockVersionInfoRecord as mockVersion,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { WhatsNewNotification } from "./WhatsNewNotification";

const LAST_ACK_SETTINGS_URL = `path:/api/setting/last-acknowledged-version`;

const notification = () => screen.queryByText("See what's new");

const setup = ({
  isWhiteLabeling = false,
  isEmbedded = false,
  lastAcknowledged = null,
  currentVersion = "v0.48.0",
  versions = [
    mockVersion({ version: "v0.48.2" }),
    mockVersion({ version: "v0.48.1" }),
    mockVersion({
      version: "v0.48.0",
      announcement_url: "https://metabase.com/releases/48",
    }),
    mockVersion({ version: "v0.47.0" }),
  ],
}: {
  isWhiteLabeling?: boolean;
  isEmbedded?: boolean;
  currentVersion?: string;
  lastAcknowledged?: string | null;
  versions?: VersionInfoRecord[];
}) => {
  jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(isEmbedded);

  const versionMock = createMockVersion({ tag: currentVersion });

  const [latest, ...older] = versions;

  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([createMockSettingDefinition()]);

  const mockState = createMockState({
    settings: mockSettings({
      version: versionMock,
      "version-info": createMockVersionInfo({ latest, older }),
      "last-acknowledged-version": lastAcknowledged,
      "application-name": isWhiteLabeling ? "My App" : "Metabase",
      "token-features": createMockTokenFeatures({
        whitelabel: isWhiteLabeling,
      }),
    }),
  });

  if (isWhiteLabeling) {
    setupEnterprisePlugins();
  }

  return renderWithProviders(<WhatsNewNotification></WhatsNewNotification>, {
    storeInitialState: mockState,
  });
};

describe("WhatsNewNotification", () => {
  describe("display logic", () => {
    it("should show the notification if the last acknowledged version is null", () => {
      setup({ currentVersion: "v0.48.0", lastAcknowledged: null });
      expect(notification()).toBeInTheDocument();
    });

    it("should not show the notification is whitelabeling is being used", () => {
      setup({ currentVersion: "v0.48.0", isWhiteLabeling: true });
      expect(notification()).not.toBeInTheDocument();
    });

    it("should show the notification for a version in the range (last acknowledged, currentVresion]", () => {
      setup({ currentVersion: "v0.48.2", lastAcknowledged: "v0.47.1" });
      expect(notification()).toBeInTheDocument();
    });

    it("should show the notification if the last acknowledged version is the previous major", () => {
      setup({ currentVersion: "v0.48.0", lastAcknowledged: "v0.47.0" });
      expect(notification()).toBeInTheDocument();
    });
  });

  describe("link behaviour", () => {
    it("should have target blank", () => {
      setup({});
      expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
    });

    it("should call the backend when clicking dismiss", async () => {
      fetchMock.put(LAST_ACK_SETTINGS_URL, {});
      setup({});

      screen.getByRole("button").click();

      await waitFor(() => {
        expect(
          fetchMock.called(LAST_ACK_SETTINGS_URL, { method: "PUT" }),
        ).toBeTruthy();
      });
    });

    it("should link the most recent release if two versions have the release notes", () => {
      setup({
        currentVersion: "v0.48.0",
        lastAcknowledged: "v0.46.0",
        versions: [
          mockVersion({
            version: "v0.48.0",
            announcement_url: "https://metabase.com/releases/48",
          }),
          mockVersion({
            version: "v0.47.0",
            announcement_url: "https://metabase.com/releases/47",
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
