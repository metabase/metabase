import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenStatus,
  createMockVersion,
  createMockVersionInfo,
  createMockVersionInfoRecord,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SettingsUpdatesForm } from "./SettingsUpdatesForm";

const elements = [
  {
    key: "check-for-updates",
    display_name: "Check for updates",
    type: "boolean",
  },
];

function setup({
  isHosted = false,
  isPaid = false,
  currentVersion = "v1.0.0",
  latestVersion = "v2.0.0",
  nightlyVersion = "v1.2.1",
  betaVersion = "v1.3.0",
  channel = "latest",
} = {}) {
  const version = currentVersion
    ? createMockVersion({ tag: currentVersion })
    : null;

  const versionInfo = currentVersion
    ? createMockVersionInfo({
        latest: createMockVersionInfoRecord({ version: latestVersion }),
        nightly: createMockVersionInfoRecord({ version: nightlyVersion }),
        beta: createMockVersionInfoRecord({ version: betaVersion }),
      })
    : null;

  const settings = mockSettings({
    "is-hosted?": isHosted,
    version,
    "version-info": versionInfo,
    "check-for-updates": true,
    "token-status": createMockTokenStatus({ valid: isPaid }),
    "update-channel": channel,
  });

  const state = createMockState({
    settings,
    currentUser: { is_superuser: true },
  });

  renderWithProviders(
    <SettingsUpdatesForm elements={elements} updateSetting={() => {}} />,
    {
      storeInitialState: state,
    },
  );
}

describe("SettingsUpdatesForm", () => {
  it("shows custom message for Cloud installations", () => {
    setup({ isHosted: true });
    expect(
      screen.getByText(/Metabase Cloud keeps your instance up-to-date/),
    ).toBeInTheDocument();
  });

  it("shows check for updates toggle", async () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });

    expect(await screen.findByText(/Check for updates/i)).toBeInTheDocument();
  });

  it("shows release channel selection", async () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });

    expect(
      await screen.findByText("Types of releases to check for"),
    ).toBeInTheDocument();
  });

  it("shows correct message when latest version is installed", async () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });
    expect(
      screen.getByText(/You're running Metabase 1.0.0/),
    ).toBeInTheDocument();
  });

  it("shows current version when latest version info is missing", () => {
    setup({ currentVersion: "v1.0.0", latestVersion: null });
    expect(
      screen.getByText(/You're running Metabase 1.0.0/),
    ).toBeInTheDocument();
  });

  it("shows upgrade call to action on the stable channel", () => {
    setup({
      currentVersion: "v1.0.0",
      latestVersion: "v1.7.0",
      nightlyVersion: "v1.7.1",
      betaVersion: "v1.7.2",
      channel: "latest",
    });
    expect(screen.getByText(/Metabase 1.7.0 is available/)).toBeInTheDocument();
  });

  it("shows upgrade call to action on the nightly channel", () => {
    setup({
      currentVersion: "v1.0.0",
      latestVersion: "v1.7.0",
      nightlyVersion: "v1.7.1",
      betaVersion: "v1.7.2",
      channel: "nightly",
    });
    expect(screen.getByText(/Metabase 1.7.1 is available/)).toBeInTheDocument();
  });

  it("shows upgrade call to action on the beta channel", () => {
    setup({
      currentVersion: "v1.0.0",
      latestVersion: "v1.7.0",
      nightlyVersion: "v1.7.1",
      betaVersion: "v1.7.2-beta",
      channel: "beta",
    });
    expect(
      screen.getByText(/Metabase 1.7.2-beta is available/),
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
