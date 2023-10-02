import { IndexRoute, Route } from "react-router";

import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import type { Engine } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngineSource,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { setupDatabaseEndpoints } from "__support__/server-mocks";

import { checkNotNull } from "metabase/core/utils/types";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import { callMockEvent } from "__support__/events";
import DatabaseEditApp from "./DatabaseEditApp";

const ENGINES_MOCK: Record<string, Engine> = {
  H2: {
    "details-fields": [
      { "display-name": "Connection String", name: "db", required: true },
      { name: "advanced-options", type: "section", default: true },
    ],
    "driver-name": "H2",
    "superseded-by": null,
    source: createMockEngineSource(),
  },
  sqlite: {
    "details-fields": [
      { "display-name": "Filename", name: "db", required: true },
      { name: "advanced-options", type: "section", default: true },
    ],
    "driver-name": "SQLite",
    "superseded-by": null,
    source: createMockEngineSource(),
  },
};

const TestHome = () => <div />;

interface SetupOpts {
  cachingEnabled?: boolean;
  databaseIdParam?: string;
  initialRoute?: string;
}

async function setup({
  cachingEnabled = false,
  databaseIdParam = "",
  initialRoute = `/${databaseIdParam}`,
}: SetupOpts = {}) {
  const mockEventListener = jest.spyOn(window, "addEventListener");

  const settings = mockSettings({
    engines: ENGINES_MOCK,
    "token-features": createMockTokenFeatures({
      cache_granular_controls: true,
    }),
    "enable-query-caching": cachingEnabled,
  });

  const { history } = renderWithProviders(
    <Route path="/">
      <Route path="/home" component={TestHome} />
      <IndexRoute component={DatabaseEditApp} />
      <Route path=":databaseId" component={DatabaseEditApp} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: {
        settings,
      },
    },
  );

  return {
    history: checkNotNull(history),
    mockEventListener,
  };
}

describe("DatabaseEditApp", () => {
  describe("Database connections", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should have save changes button disabled", async () => {
      setupDatabaseEndpoints(createMockDatabase());
      await setup({ databaseIdParam: "1" });

      const saveButton = await screen.findByRole("button", {
        name: /save changes/i,
      });
      expect(saveButton).toBeDisabled();

      const connectionField = await screen.findByLabelText("Connection String");
      userEvent.type(connectionField, "Test Connection");

      await waitFor(() => {
        expect(saveButton).toBeEnabled();
      });
    });

    it("should trigger beforeunload event when database connection is edited", async () => {
      const { mockEventListener } = await setup();

      const databaseForm = await screen.findByLabelText("Display name");

      userEvent.type(databaseForm, "Test database");
      const mockEvent = await waitFor(() => {
        return callMockEvent(mockEventListener, "beforeunload");
      });
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should not trigger beforeunload event when database connection is unchanged", async () => {
      const { mockEventListener } = await setup();
      const mockEvent = callMockEvent(mockEventListener, "beforeunload");

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(undefined);
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const { history } = await setup({ initialRoute: "/home" });

      history.push("/");

      const databaseForm = await screen.findByLabelText("Display name");

      userEvent.type(databaseForm, "Test database");

      history.goBack();

      expect(screen.getByText("Changes were not saved")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Navigating away from here will cause you to lose any changes you have made.",
        ),
      ).toBeInTheDocument();
    });
  });

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
