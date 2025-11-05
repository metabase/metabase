import { act } from "react-dom/test-utils";

import {
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { UpdatesSettingsPage } from "./UpdatesSettingsPage";

const setup = async (props: { isHosted: boolean; versionTag: string }) => {
  const updatesSettings = {
    "is-hosted?": props.isHosted,
    "check-for-updates": true,
    version: {
      date: "2025-03-19",
      src_hash: "4df5cf3e5e86b0cc7421d80e2a8835e2ce3afa7d",
      tag: props.versionTag,
      hash: "4742ea1",
    },
  } as const;

  const settings = createMockSettings(updatesSettings);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: {
      latest: {
        version: "v1.53.8",
        released: "2025-03-25",
        patch: true,
      },
    },
  });
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(
    <div>
      <UpdatesSettingsPage />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("UpdatesSettingsPage", () => {
  it("should render a UpdatesSettingsPage", async () => {
    await act(() =>
      setup({
        isHosted: false,
        versionTag: "v1.53.8",
      }),
    );

    [
      "Check for updates",
      "You're running Metabase 1.53.8 which is the latest and greatest!",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should load initial settings", async () => {
    await act(() =>
      setup({
        isHosted: false,
        versionTag: "v1.53.8",
      }),
    );
    expect(await screen.findByRole("switch")).toBeChecked();
  });
});
