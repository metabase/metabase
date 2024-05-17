import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenStatus,
  createMockVersion,
  createMockVersionInfo,
  createMockVersionInfoRecord,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import SettingsUpdatesForm from "./SettingsUpdatesForm";

const elements = [
  {
    key: "key",
    widget: "span",
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
    "token-status": createMockTokenStatus({ valid: isPaid }),
  });

  const state = createMockState({
    settings,
    currentUser: { is_superuser: true },
  });

  renderWithProviders(<SettingsUpdatesForm elements={elements} />, {
    storeInitialState: state,
  });
}

describe("SettingsUpdatesForm", () => {
  it("shows custom message for Cloud installations", () => {
    setup({ isHosted: true });
    expect(
      screen.getByText(/Metabase Cloud keeps your instance up-to-date/),
    ).toBeInTheDocument();
  });

  it("shows correct message when latest version is installed", () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });
    expect(
      screen.getByText(/You're running Metabase 1.0.0/),
    ).toBeInTheDocument();
  });

  it("shows correct message when no version checks have been run", () => {
    setup({ currentVersion: null, latestVersion: null });
    expect(screen.getByText("No successful checks yet.")).toBeInTheDocument();
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
