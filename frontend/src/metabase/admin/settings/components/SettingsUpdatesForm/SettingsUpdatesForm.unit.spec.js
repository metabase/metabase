import React from "react";
import { render, screen } from "@testing-library/react";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  createMockVersion,
  createMockVersionInfo,
  createMockVersionInfoRecord,
} from "metabase-types/api/mocks";
import SettingsUpdatesForm from "./SettingsUpdatesForm";

const elements = [
  {
    key: "key",
    widget: "widget",
  },
];

function setup({
  isHosted = false,
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

  mockSettings({
    "is-hosted?": isHosted,
    version,
    "version-info": versionInfo,
  });

  render(<SettingsUpdatesForm elements={elements} />);
}

describe("SettingsUpdatesForm", () => {
  it("shows custom message for Cloud installations", () => {
    setup({ isHosted: true });
    screen.getByText(/Metabase Cloud keeps your instance up-to-date/);
  });

  it("shows correct message when latest version is installed", () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });
    screen.getByText(/You're running Metabase 1.0.0/);
  });

  it("shows correct message when no version checks have been run", () => {
    setup({ currentVersion: null, latestVersion: null });
    screen.getByText("No successful checks yet.");
  });

  it("shows upgrade call-to-action if not in Enterprise plan", () => {
    setup({ currentVersion: "v1.0.0", latestVersion: "v1.0.0" });
    screen.getByText("Migrate to Metabase Cloud.");
  });

  it("does not show upgrade call-to-action if in Enterprise plan", () => {
    setupEnterpriseTest();

    setup({ currentVersion: "v1.0.0", latestVersion: "v2.0.0" });

    expect(screen.queryByText("Migrate to Metabase Cloud.")).toBeNull();
  });
});
