import React from "react";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { Router, Route } from "react-router";
import { createMemoryHistory } from "history";
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import admin from "metabase/admin/admin";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";
import { getStore } from "__support__/entities-store";
import DatabaseEditApp from "./DatabaseEditApp";

const ENGINES_MOCK = {
  h2: {
    "details-fields": [
      { "display-name": "Connection String", name: "db", required: true },
    ],
    "driver-name": "H2",
    "superseded-by": null,
  },
  sqlite: {
    "details-fields": [
      { "display-name": "Filename", name: "db", required: true },
    ],
    "driver-name": "SQLite",
    "superseded-by": null,
  },
};

function mockSettings({ cachingEnabled = false }) {
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "engines") {
      return ENGINES_MOCK;
    }
    if (key === "enable-query-caching") {
      return cachingEnabled;
    }
    if (key === "site-url") {
      return "http://localhost:3333";
    }
  });
}

async function setup({ cachingEnabled = false } = {}) {
  mockSettings({ cachingEnabled });

  render(
    <Provider store={getStore({ admin, form })}>
      <Router history={createMemoryHistory()}>
        <Route path="/" component={DatabaseEditApp} />
      </Router>
    </Provider>,
  );

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
        PLUGIN_CACHING.databaseCacheTTLFormField = {
          name: "cache_ttl",
          type: "integer",
          title: "Default result cache duration",
        };
      });

      afterEach(() => {
        PLUGIN_CACHING.databaseCacheTTLFormField = null;
      });

      it("is visible", async () => {
        await setup({ cachingEnabled: true });

        expect(
          screen.queryByText("Default result cache duration"),
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
