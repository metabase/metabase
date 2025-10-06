import {
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { UpdatesNavItem } from "./UpdatesNavItem";

const setup = async (props: { versionTag: string }) => {
  const versionNoticeSettings = {
    version: {
      date: "2025-03-19",
      src_hash: "4df5cf3e5e86b0cc7421d80e2a8835e2ce3afa7d",
      tag: props.versionTag,
      hash: "4742ea1",
    },
  };

  const settings = createMockSettings(versionNoticeSettings);
  setupPropertiesEndpoints(settings);
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: {
      latest: {
        version: "v1.60.0",
        released: "2025-03-25",
        patch: true,
        highlights: [],
      },
    },
  });

  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(<UpdatesNavItem />, {
    storeInitialState: {
      settings: createMockSettingsState(settings),
    },
  });

  await screen.findByText("Updates");
};

describe("UpdatesNavItem", () => {
  it("should not show badge if there are no updates available", async () => {
    await setup({ versionTag: "v1.60.0" });

    await waitFor(() => {
      const indicatorDot = document.querySelector(
        '[class*="Indicator-indicator"]',
      );
      expect(indicatorDot).not.toBeInTheDocument();
    });
  });

  it("should show badge when updates are available", async () => {
    await setup({ versionTag: "v1.40.8" });
    await waitFor(() => {
      const indicatorDot = document.querySelector(
        '[class*="Indicator-indicator"]',
      );
      expect(indicatorDot).toBeInTheDocument();
    });
  });
});
