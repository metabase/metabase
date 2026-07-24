import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

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
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import {
  ChangelogPanel,
  NewVersionInfo,
  VersionUpdateNotice,
} from "./VersionUpdateNotice";

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
      // Unjustified type cast. FIXME
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

describe("ChangelogPanel", () => {
  it("should show a loader while version info is loading", () => {
    renderWithProviders(
      <ChangelogPanel isLoading isError={false} latestMajorVersion="" />,
    );

    expect(screen.getByTestId("changelog-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("changelog-iframe")).not.toBeInTheDocument();
  });

  it("should point the iframe at the latest major version", () => {
    renderWithProviders(
      <ChangelogPanel
        isLoading={false}
        isError={false}
        latestMajorVersion="53"
      />,
    );

    expect(screen.getByTestId("changelog-iframe")).toHaveAttribute(
      "src",
      expect.stringContaining("/changelog/53"),
    );
    expect(
      screen.queryByTestId("changelog-unavailable"),
    ).not.toBeInTheDocument();
  });

  it("should show an unavailable message when the version is missing", () => {
    renderWithProviders(
      <ChangelogPanel
        isLoading={false}
        isError={false}
        latestMajorVersion=""
      />,
    );

    expect(
      screen.getByText(
        "Version information is unavailable. Try to refresh the page.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("changelog-iframe")).not.toBeInTheDocument();
  });

  it("should show an unavailable message on error", () => {
    renderWithProviders(
      <ChangelogPanel isLoading={false} isError latestMajorVersion="53" />,
    );

    expect(screen.getByTestId("changelog-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("changelog-iframe")).not.toBeInTheDocument();
  });
});

const setupNewVersionInfo = (versionInfo: VersionInfo | null) => {
  fetchMock.get(
    "path:/api/setting/version-info",
    versionInfo === null
      ? {
          status: 200,
          headers: { "content-type": "application/json" },
          body: "null",
        }
      : versionInfo,
  );

  return renderWithProviders(<NewVersionInfo />);
};

describe("NewVersionInfo", () => {
  it("should wire the latest major version through to the changelog iframe", async () => {
    setupNewVersionInfo({
      latest: { version: "v1.53.9", released: "2025-03-25" },
    });
    await userEvent.click(screen.getByRole("tab", { name: "Changelog" }));

    expect(await screen.findByTestId("changelog-iframe")).toHaveAttribute(
      "src",
      expect.stringContaining("/changelog/53"),
    );
  });

  it("should show the unavailable message when version info is null", async () => {
    setupNewVersionInfo(null);
    await userEvent.click(screen.getByRole("tab", { name: "Changelog" }));

    expect(
      await screen.findByTestId("changelog-unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("changelog-iframe")).not.toBeInTheDocument();
  });

  it("should always render the releases iframe", async () => {
    setupNewVersionInfo(null);

    expect(await screen.findByTestId("releases-iframe")).toBeInTheDocument();
  });
});
