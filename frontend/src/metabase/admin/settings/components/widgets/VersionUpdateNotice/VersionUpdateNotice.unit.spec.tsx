import {
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import type { SettingKey, UpdateChannel } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { VersionUpdateNotice } from "./VersionUpdateNotice";

const setup = (props: {
  updateChannel: UpdateChannel;
  isHosted: boolean;
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
    "is-hosted?": props.isHosted,
  };

  const settings = createMockSettings(versionNoticeSettings);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
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
  it("should tell cloud users they are up to date", async () => {
    setup({ isHosted: true, versionTag: "v1.53.8", updateChannel: "latest" });
    expect(
      await screen.findByText(
        "Metabase Cloud keeps your instance up-to-date. You're currently on version 1.53.8. Thanks for being a customer!",
      ),
    ).toBeInTheDocument();
  });

  it("should tell the user if they're on the latest version", async () => {
    setup({ isHosted: false, versionTag: "v1.53.8", updateChannel: "latest" });
    expect(
      await screen.findByText(
        "You're running Metabase 1.53.8 which is the latest and greatest!",
      ),
    ).toBeInTheDocument();
  });

  it("should tell the user if there's a new version", async () => {
    setup({ isHosted: false, versionTag: "v1.53.8", updateChannel: "beta" });
    expect(
      await screen.findByText(
        "Metabase 1.54.0-beta is available. You're running 1.53.8.",
      ),
    ).toBeInTheDocument();
  });

  it("should display default message if bad data", async () => {
    setup({
      isHosted: false,
      versionTag: "notaversion",
      updateChannel: "beta",
    });
    expect(
      await screen.findByText("You're running Metabase notaversion"),
    ).toBeInTheDocument();
  });
});
