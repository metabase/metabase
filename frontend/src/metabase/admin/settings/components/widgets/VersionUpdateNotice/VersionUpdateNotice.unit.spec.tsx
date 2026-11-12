import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingEndpoint,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { dayjs } from "metabase/dayjs";
import type { SettingKey, VersionInfo } from "metabase-types/api";
import {
  createMockMajorVersionSupport,
  createMockSettingDefinition,
  createMockSettings,
  createMockVersionInfo,
  createMockVersionInfoRecord,
} from "metabase-types/api/mocks";

import { VersionUpdateNotice } from "./VersionUpdateNotice";
import { getEolReachedMessage } from "./utils";

const LATEST = "v1.53.9";
const CURRENT = "v1.53.8";
const FUTURE_EOL = "2099-06-01";
const PAST_EOL = "2000-06-01";

function versionInfoWithEol(eol: string): VersionInfo {
  return createMockVersionInfo({
    latest: createMockVersionInfoRecord({ version: LATEST }),
    major_version_support: [createMockMajorVersionSupport({ major: 53, eol })],
  });
}

const setup = (props: {
  isHosted: boolean;
  versionTag: string;
  versionInfo?: VersionInfo;
}) => {
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
    settingValue:
      props.versionInfo ??
      createMockVersionInfo({
        latest: createMockVersionInfoRecord({ version: LATEST }),
      }),
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
    setup({ isHosted: false, versionTag: LATEST });
    expect(
      await screen.findByText(
        "You're running Metabase 1.53.9, which is the latest and greatest.",
      ),
    ).toBeInTheDocument();
  });

  it("should tell the user if there's a new version", async () => {
    setup({ isHosted: false, versionTag: CURRENT });
    expect(
      await screen.findByText(
        "Metabase 1.53.9 is available. You're running 1.53.8.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update" })).toBeInTheDocument();
  });

  it("should display default message if bad data", async () => {
    setup({
      isHosted: false,
      versionTag: "notaversion",
    });
    expect(
      await screen.findByText("You're running Metabase notaversion."),
    ).toBeInTheDocument();
  });

  it("should show the eol date when the current version is the latest", async () => {
    setup({
      isHosted: false,
      versionTag: LATEST,
      versionInfo: versionInfoWithEol(FUTURE_EOL),
    });

    expect(
      await screen.findByText(dayjs.utc(FUTURE_EOL).format("ll")),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("heart_handshake icon")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Update" }),
    ).not.toBeInTheDocument();
  });

  it("should show the pre-eol message on hover when no update is available", async () => {
    setup({
      isHosted: false,
      versionTag: LATEST,
      versionInfo: versionInfoWithEol(FUTURE_EOL),
    });

    await userEvent.hover(await screen.findByLabelText("heart_handshake icon"));

    expect(
      await screen.findByText(/will reach end-of-life on/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "https://www.metabase.com/version-support",
    );
  });

  it("should mention end-of-life when a new version is available after eol", async () => {
    setup({
      isHosted: false,
      versionTag: CURRENT,
      versionInfo: versionInfoWithEol(PAST_EOL),
    });

    expect(
      await screen.findByText(
        "Metabase 1.53.9 is available. You're running 1.53.8, which has reached end-of-life.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("info icon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update" })).toBeInTheDocument();

    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(await screen.findByText(getEolReachedMessage())).toBeInTheDocument();
  });
});
