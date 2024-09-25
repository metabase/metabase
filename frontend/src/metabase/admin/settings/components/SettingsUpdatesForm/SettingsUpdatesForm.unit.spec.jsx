import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenStatus,
  createMockVersion,
  createMockVersionInfo,
  createMockVersionInfoRecord,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import {SettingsUpdatesForm} from "./SettingsUpdatesForm";

const elements = [
  {
    key: "check-for-updates",
    display_name: 'Check for updates',
    type: "boolean",
  },
];

function setup({
  isHosted = false,
  isPaid = false,
  currentVersion = "v1.0.0",
  latestVersion = "v2.0.0",
} = {}) {
  const version = currentVersion
    ? createMockVersion({ tag: currentVersion })
    : null;

  const versionInfo = currentVersion
    ? createMockVersionInfo({
        latest: createMockVersionInfoRecord({ version: latestVersion }),
      })
    : null;

  const settings = mockSettings({
    "is-hosted?": isHosted,
    version,
    "version-info": versionInfo,
    "check-for-updates": true,
    "token-status": createMockTokenStatus({ valid: isPaid }),
  });

  const state = createMockState({
    settings,
    currentUser: { is_superuser: true },
  });

  renderWithProviders(<
    SettingsUpdatesForm
      elements={elements}
      updateSetting={() => {}}
    />, {
    storeInitialState: state,
  });
}

describe("SettingsUpdatesForm", () => {
  it("shows custom message for Cloud installations", async () => {
    setup({ isHosted: true });
    expect(
      await screen.findByText(/Metabase Cloud keeps your instance up-to-date/),
    ).toBeInTheDocument();
  });

  it("shows check for updates toggle", async () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });

    expect(await screen.findByText(/Check for updates/i)).toBeInTheDocument();
  });

  it("shows release channel selection", async () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });

    expect(await screen.findByText("Update Channel")).toBeInTheDocument();
  });

  it("shows correct message when latest version is installed", async () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });
    expect(
      await screen.findByText(/You're running Metabase 1.0.0/),
    ).toBeInTheDocument();
  });

  it("shows current version when latest version info is missing", () => {
    setup({ currentVersion: "v1.0.0", latestVersion: null });
    expect(
      screen.getByText(/You're running Metabase 1.0.0/),
    ).toBeInTheDocument();
  });

  it("shows upgrade call-to-action if not in Enterprise plan", () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });
    expect(screen.getByText("Get automatic updates")).toBeInTheDocument();
  });

  it("does not show upgrade call-to-action if is a paid plan", () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v2.0.0", isPaid: true });

    expect(
      screen.queryByText("Get automatic updates."),
    ).not.toBeInTheDocument();
  });
});
