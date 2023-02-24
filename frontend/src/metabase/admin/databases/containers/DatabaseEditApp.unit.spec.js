import React from "react";
import { Route } from "react-router";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import { createMockTokenFeatures } from "metabase-types/api/mocks";

import DatabaseEditApp from "./DatabaseEditApp";

const ENGINES_MOCK = {
  h2: {
    "details-fields": [
      { "display-name": "Connection String", name: "db", required: true },
      { name: "advanced-options", type: "section", default: true },
    ],
    "driver-name": "H2",
    "superseded-by": null,
  },
  sqlite: {
    "details-fields": [
      { "display-name": "Filename", name: "db", required: true },
      { name: "advanced-options", type: "section", default: true },
    ],
    "driver-name": "SQLite",
    "superseded-by": null,
  },
};

const ComponentMock = () => <div />;
jest.mock(
  "metabase/databases/containers/DatabaseHelpCard",
  () => ComponentMock,
);

async function setup({ cachingEnabled = false } = {}) {
  const settings = mockSettings({
    engines: ENGINES_MOCK,
    "token-features": createMockTokenFeatures({ advanced_config: true }),
    "enable-query-caching": cachingEnabled,
  });

  renderWithProviders(<Route path="/" component={DatabaseEditApp} />, {
    withRouter: true,
    storeInitialState: {
      settings,
    },
  });

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
}

describe("DatabaseEditApp", () => {
  describe("Cache TTL field", () => {
    describe("OSS", () => {
      it("is invisible", async () => {
        await setup({ cachingEnabled: true });

        expect(
          screen.queryByText("Default result cache duration"),
        ).not.toBeInTheDocument();
      });
    });

    describe("EE", () => {
      beforeEach(() => {
        setupEnterpriseTest();
      });

      it("is visible", async () => {
        await setup({ cachingEnabled: true });

        expect(
          screen.getByText("Default result cache duration"),
        ).toBeInTheDocument();
      });

      it("is invisible when caching disabled", async () => {
        await setup({ cachingEnabled: false });

        expect(
          screen.queryByText("Default result cache duration"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
