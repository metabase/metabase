import dayjs from "dayjs";
import { act } from "react-dom/test-utils";

import {
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { SettingKey, VersionInfo } from "metabase-types/api";
import {
  createMockMajorVersionSupport,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { UpdatesSettingsPage } from "./UpdatesSettingsPage";

const FUTURE_EOL = "2099-06-01";

const setup = async (props: {
  isHosted: boolean;
  versionTag: string;
  isPro?: boolean;
  checkForUpdates?: boolean;
  versionInfo?: VersionInfo;
}) => {
  // having any SSO feature is how we detect if you have a pro plan
  const tokenFeatures = createMockTokenFeatures(
    props.isPro ? { sso_jwt: true } : {},
  );

  const updatesSettings = {
    "is-hosted?": props.isHosted,
    "check-for-updates": props.checkForUpdates ?? true,
    version: {
      date: "2025-03-19",
      src_hash: "4df5cf3e5e86b0cc7421d80e2a8835e2ce3afa7d",
      tag: props.versionTag,
      hash: "4742ea1",
    },
    "token-features": tokenFeatures,
  };

  const settings = createMockSettings(updatesSettings);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: props.versionInfo ?? {
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
        currentUser: createMockUser({ is_superuser: true }), // upsells only show for admins
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

    expect(screen.getByText("Check for updates")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "You're running Metabase 1.53.8, which is the latest and greatest.",
      ),
    ).toBeInTheDocument();
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

  it("should show upsell when not hosted", async () => {
    await act(() =>
      setup({
        isHosted: false,
        isPro: false,
        versionTag: "v1.53.8",
      }),
    );
    expect(
      await screen.findByText("Migrate to Metabase Cloud"),
    ).toBeInTheDocument();
  });

  it("should not show upsell to self-hosted pro users", async () => {
    await act(() =>
      setup({
        isHosted: false,
        isPro: true,
        versionTag: "v1.53.8",
      }),
    );
    expect(
      screen.queryByText("Migrate to Metabase Cloud"),
    ).not.toBeInTheDocument();
  });

  it("should not show upsell when hosted", async () => {
    await act(() =>
      setup({
        isHosted: true,
        versionTag: "v1.53.8",
      }),
    );
    expect(
      screen.queryByText("Migrate to Metabase Cloud"),
    ).not.toBeInTheDocument();
  });

  it("should show the version notice and eol notice when checking for updates", async () => {
    await setup({
      isHosted: false,
      versionTag: "v1.53.8",
      versionInfo: createMockVersionInfo({
        latest: {
          version: "v1.53.8",
          released: "2025-03-25",
          patch: true,
        },
        major_version_support: [
          createMockMajorVersionSupport({ major: 53, eol: FUTURE_EOL }),
        ],
      }),
    });

    expect(
      await screen.findByText(
        "You're running Metabase 1.53.8, which is the latest and greatest.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dayjs.utc(FUTURE_EOL).format("ll")),
    ).toBeInTheDocument();
  });

  it("should not show the eol notice when check for updates is off", async () => {
    await setup({
      isHosted: false,
      versionTag: "v1.53.8",
      checkForUpdates: false,
      versionInfo: createMockVersionInfo({
        latest: {
          version: "v1.53.8",
          released: "2025-03-25",
          patch: true,
        },
        major_version_support: [
          createMockMajorVersionSupport({ major: 53, eol: FUTURE_EOL }),
        ],
      }),
    });

    expect(screen.queryByText(/end-of-life/)).not.toBeInTheDocument();
  });
});
