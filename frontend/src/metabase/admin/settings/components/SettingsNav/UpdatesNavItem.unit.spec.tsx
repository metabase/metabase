import {
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { SettingKey, UpdateChannel } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { UpdatesNavItem } from "./UpdatesNavItem";

const setup = async (props: {
  updateChannel: UpdateChannel;
  versionTag: string;
}) => {
  const versionNoticeSettings = {
    version: {
      date: "2025-03-19",
      src_hash: "4df5cf3e5e86b0cc7421d80e2a8835e2ce3afa7d",
      tag: props.versionTag,
      hash: "4742ea1",
    },
    "update-channel": props.updateChannel,
  };

  const settings = createMockSettings(versionNoticeSettings);
  setupPropertiesEndpoints(settings);
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: {
      beta: {
        version: "v1.54.0-beta",
        released: "2025-03-24",
        highlights: [],
      },
      latest: {
        version: "v1.53.8",
        released: "2025-03-25",
        patch: true,
        highlights: [],
      },
      nightly: {
        version: "v1.52.3",
        released: "2024-12-16",
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
    await setup({ versionTag: "v1.53.8", updateChannel: "latest" });

    await waitFor(() => {
      const indicatorDot = document.querySelector(
        '[class*="Indicator-indicator"]',
      );
      expect(indicatorDot).not.toBeInTheDocument();
    });
  });

  it("should show badge updates are available", async () => {
    await setup({ versionTag: "v1.53.8", updateChannel: "beta" });
    await waitFor(() => {
      const indicatorDot = document.querySelector(
        '[class*="Indicator-indicator"]',
      );
      expect(indicatorDot).toBeInTheDocument();
    });
  });
});
