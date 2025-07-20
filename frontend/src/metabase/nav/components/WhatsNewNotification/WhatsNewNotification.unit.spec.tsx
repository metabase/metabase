import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import type { VersionInfo, VersionInfoRecord } from "metabase-types/api"; // Add VersionInfo
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockVersion,
  createMockVersionInfo,
  createMockVersionInfoRecord as mockVersion,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { WhatsNewNotification } from "./WhatsNewNotification";

const LAST_ACK_SETTINGS_URL = `path:/api/setting/last-acknowledged-version`;

// Helper functions for querying notification link
const getNotificationLink = async () =>
  screen.findByRole("link", { name: /see what's new/i });
const queryNotificationLink = () =>
  screen.queryByRole("link", { name: /see what's new/i });

const setup = ({
  isWhiteLabeling = false,
  isEmbedded = false,
  lastAcknowledged = null,
  currentVersionTag = "v0.48.0", // Renamed for clarity
  versions = [
    // Default versions from original test
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
  currentVersionTag?: string;
  lastAcknowledged?: string | null;
  versions?: VersionInfoRecord[];
} = {}) => {
  // Added default empty object
  jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(isEmbedded);

  const versionMock = createMockVersion({ tag: currentVersionTag });
  const [latest, ...older] = versions;
  const versionInfo: VersionInfo = createMockVersionInfo({ latest, older });

  // Mock the API endpoint for version-info
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: versionInfo,
  });

  // Mock the Redux state for settings read by useSetting and other selectors
  const state = createMockState({
    settings: mockSettings({
      version: versionMock,
      "last-acknowledged-version": lastAcknowledged,
      "application-name": isWhiteLabeling ? "My App" : "Metabase",
      "token-features": createMockTokenFeatures({
        whitelabel: isWhiteLabeling,
      }),
    }),
  });

  if (isWhiteLabeling) {
    setupEnterprisePlugins(); // Keep this if whitelabeling is EE
  }

  return renderWithProviders(<WhatsNewNotification />, {
    storeInitialState: state,
  });
};

describe("WhatsNewNotification", () => {
  describe("display logic", () => {
    it("should show the notification if the last acknowledged version is null", async () => {
      setup({ currentVersionTag: "v0.48.0", lastAcknowledged: null });
      expect(await getNotificationLink()).toBeInTheDocument();
    });

    it("should not show the notification if whitelabeling is being used", async () => {
      setup({ currentVersionTag: "v0.48.0", isWhiteLabeling: true });
      // Wait briefly to ensure it doesn't appear after potential fetch
      await waitFor(() => {
        expect(queryNotificationLink()).not.toBeInTheDocument();
      });
    });

    it("should not show the notification if embedding", async () => {
      setup({ currentVersionTag: "v0.48.0", isEmbedded: true });
      await waitFor(() => {
        expect(queryNotificationLink()).not.toBeInTheDocument();
      });
    });

    it("should show the notification for a version in the range (last acknowledged, currentVersion]", async () => {
      setup({ currentVersionTag: "v0.48.2", lastAcknowledged: "v0.47.1" });
      expect(await getNotificationLink()).toBeInTheDocument();
    });

    it("should show the notification if the last acknowledged version is the previous major", async () => {
      setup({ currentVersionTag: "v0.48.0", lastAcknowledged: "v0.47.0" });
      expect(await getNotificationLink()).toBeInTheDocument();
    });

    it("should not show the notification if the latest version is not newer than acknowledged", async () => {
      setup({ currentVersionTag: "v0.48.2", lastAcknowledged: "v0.48.2" });
      await waitFor(() => {
        expect(queryNotificationLink()).not.toBeInTheDocument();
      });
    });

    it("should not show the notification if the latest version is not newer than current (and nothing acknowledged)", async () => {
      setup({
        currentVersionTag: "v0.48.2",
        lastAcknowledged: null,
        versions: [mockVersion({ version: "v0.48.2" })], // Latest is same as current
      });
      await waitFor(() => {
        expect(queryNotificationLink()).not.toBeInTheDocument();
      });
    });
  });

  describe("link behaviour", () => {
    it("should have target blank", async () => {
      setup({});
      expect(await getNotificationLink()).toHaveAttribute("target", "_blank");
    });

    it("should call the backend when clicking dismiss", async () => {
      // fetchMock is used here to intercept the PUT request made by the updateSetting thunk
      fetchMock.putOnce(LAST_ACK_SETTINGS_URL, { status: 200, body: {} });
      const currentVersionTag = "v0.48.0";
      setup({ currentVersionTag });

      // Find the dismiss button (ensure it has an accessible name, e.g., aria-label="Dismiss")
      const dismissButton = await screen.findByRole("button", {
        name: /close/i,
      }); // Use the icon name if no specific label
      dismissButton.click();

      await waitFor(() => {
        expect(fetchMock.called(LAST_ACK_SETTINGS_URL)).toBe(true);
      });

      await waitFor(() => {
        const fetchOptions = fetchMock.lastOptions(LAST_ACK_SETTINGS_URL);
        expect(fetchOptions?.method).toBe("PUT");
      });

      await waitFor(async () => {
        const fetchOptions = fetchMock.lastOptions(LAST_ACK_SETTINGS_URL);
        expect(
          JSON.parse(await (fetchOptions?.body as Promise<string>)),
        ).toEqual({ value: currentVersionTag });
      });

      // Clean up fetchMock after the test
      fetchMock.reset();
    });

    it("should link the most recent eligible release notes", async () => {
      const expectedUrl = "https://metabase.com/releases/48";
      setup({
        currentVersionTag: "v0.48.0",
        lastAcknowledged: "v0.46.0",
        versions: [
          mockVersion({
            version: "v0.48.0", // Eligible
            announcement_url: expectedUrl,
          }),
          mockVersion({
            version: "v0.47.0", // Also eligible, but older
            announcement_url: "https://metabase.com/releases/47",
          }),
          mockVersion({
            version: "v0.46.0", // Not eligible (same as acknowledged)
            announcement_url: "https://metabase.com/releases/46",
          }),
        ],
      });

      expect(await getNotificationLink()).toHaveAttribute("href", expectedUrl);
    });
  });
});
