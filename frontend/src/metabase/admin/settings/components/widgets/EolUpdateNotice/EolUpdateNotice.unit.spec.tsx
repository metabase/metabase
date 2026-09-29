import { findRequests, setupSettingEndpoint } from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { VersionInfo } from "metabase-types/api";
import {
  createMockMajorVersionSupport,
  createMockSettings,
  createMockVersion,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { EolUpdateNotice } from "./EolUpdateNotice";

const CURRENT_VERSION = "v1.56.3";
const FUTURE_EOL = "2099-06-01";
const PAST_EOL = "2000-06-01";

function versionInfoWithEol(eol: string): VersionInfo {
  return createMockVersionInfo({
    major_version_support: [createMockMajorVersionSupport({ major: 56, eol })],
  });
}

async function waitForVersionInfo() {
  await waitFor(async () => {
    const requests = await findRequests("GET");
    expect(
      requests.some((request) =>
        request.url.includes("/api/setting/version-info"),
      ),
    ).toBe(true);
  });
}

function setup({
  versionTag = CURRENT_VERSION,
  versionInfo,
  showAfterEolOnly = false,
}: {
  versionTag?: string;
  versionInfo: VersionInfo;
  showAfterEolOnly?: boolean;
}) {
  const settings = createMockSettings({
    version: createMockVersion({ tag: versionTag }),
  });
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: versionInfo,
  });

  return renderWithProviders(
    <EolUpdateNotice showAfterEolOnly={showAfterEolOnly} />,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
}

describe("EolUpdateNotice", () => {
  it("renders nothing when version-info has no matching eol", async () => {
    setup({ versionInfo: createMockVersionInfo() });

    await waitForVersionInfo();
    expect(screen.queryByText(/end-of-life/)).not.toBeInTheDocument();
  });

  it("renders nothing when the version tag is missing", () => {
    setup({
      versionTag: "",
      versionInfo: versionInfoWithEol(FUTURE_EOL),
    });

    expect(screen.queryByText(/end-of-life/)).not.toBeInTheDocument();
  });

  it("shows the upcoming eol date before eol", async () => {
    setup({ versionInfo: versionInfoWithEol(FUTURE_EOL) });

    expect(
      await screen.findByText(
        /This version of Metabase reaches end-of-life on/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/has reached end-of-life/),
    ).not.toBeInTheDocument();
  });

  it("shows the expired copy after eol", async () => {
    setup({ versionInfo: versionInfoWithEol(PAST_EOL) });

    expect(
      await screen.findByText(/has reached end-of-life/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/reaches end-of-life on/),
    ).not.toBeInTheDocument();
  });

  it("hides the upcoming notice when showAfterEolOnly is set", async () => {
    setup({
      versionInfo: versionInfoWithEol(FUTURE_EOL),
      showAfterEolOnly: true,
    });

    await waitForVersionInfo();
    expect(screen.queryByText(/end-of-life/)).not.toBeInTheDocument();
  });

  it("still shows the expired notice when showAfterEolOnly is set", async () => {
    setup({
      versionInfo: versionInfoWithEol(PAST_EOL),
      showAfterEolOnly: true,
    });

    expect(
      await screen.findByText(/has reached end-of-life/),
    ).toBeInTheDocument();
  });
});
