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

import { VersionUpdateNotice } from "./VersionUpdateNotice";

const setup = (props: { isHosted: boolean; versionTag: string }) => {
  const versionNoticeSettings = {
    version: {
      date: "2025-03-19",
      src_hash: "4df5cf3e5e86b0cc7421d80e2a8835e2ce3afa7d",
      tag: props.versionTag,
      hash: "4742ea1",
    },
    "is-hosted?": props.isHosted,
  };

  const settings = createMockSettings(versionNoticeSettings);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: {
      latest: {
        version: "v1.53.9",
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

  return renderWithProviders(
    <div>
      <VersionUpdateNotice />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("VersionUpdateNotice", () => {
  it("should tell the user if they're on the latest version", async () => {
    setup({ isHosted: false, versionTag: "v1.53.9" });
    expect(
      await screen.findByText(
        "You're running Metabase 1.53.9 which is the latest and greatest!",
      ),
    ).toBeInTheDocument();
  });

  it("should tell the user if there's a new version", async () => {
    setup({ isHosted: false, versionTag: "v1.53.8" });
    expect(
      await screen.findByText(
        "Metabase 1.53.9 is available. You're running 1.53.8.",
      ),
    ).toBeInTheDocument();
  });

  it("should display default message if bad data", async () => {
    setup({
      isHosted: false,
      versionTag: "notaversion",
    });
    expect(
      await screen.findByText("You're running Metabase notaversion"),
    ).toBeInTheDocument();
  });
});
