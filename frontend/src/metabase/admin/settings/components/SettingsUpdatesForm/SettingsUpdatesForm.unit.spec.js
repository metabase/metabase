import React from "react";
import { render as renderRTL, screen } from "@testing-library/react";
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

const render = () => {
  renderRTL(<SettingsUpdatesForm elements={elements} />);
};

describe("SettingsUpdatesForm", () => {
  it("shows custom message for Cloud installations", () => {
    mockSettings({ "is-hosted?": true });

    render();
    screen.getByText(/Metabase Cloud keeps your instance up-to-date/);
  });

  it("shows correct message when latest version is installed", () => {
    mockSettings({
      version: createMockVersion({ tag: "v1.0.0" }),
      "version-info": createMockVersionInfo({
        latest: createMockVersionInfoRecord({ version: "v1.0.0" }),
      }),
    });

    render();
    screen.getByText(/which is the latest and greatest/);
  });

  it("shows correct message when no version checks have been run", () => {
    mockSettings({
      version: null,
      "version-info": null,
    });
    render();
    screen.getByText("No successful checks yet.");
  });

  it("shows upgrade call-to-action if not in Enterprise plan", () => {
    mockSettings({
      version: createMockVersion({ tag: "v1.0.0" }),
      "version-info": createMockVersionInfo({
        latest: createMockVersionInfoRecord({ version: "v1.0.0" }),
      }),
    });

    render();
    screen.getByText("Migrate to Metabase Cloud.");
  });

  it("does not show upgrade call-to-action if in Enterprise plan", () => {
    setupEnterpriseTest();

    mockSettings({
      version: createMockVersion({ tag: "v1.0.0" }),
      "version-info": createMockVersionInfo({
        latest: createMockVersionInfoRecord({ version: "v2.0.0" }),
      }),
    });

    render();
    expect(screen.queryByText("Migrate to Metabase Cloud.")).toBeNull();
  });
});
