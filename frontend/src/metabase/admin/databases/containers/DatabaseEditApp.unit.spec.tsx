import userEvent from "@testing-library/user-event";
import { IndexRoute, Route } from "react-router";

import { callMockEvent } from "__support__/events";
import {
  setupDatabaseEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import { checkNotNull } from "metabase/lib/types";
import type { Engine } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngineSource,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

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

const MockComponent = () => <div />;

interface SetupOpts {
  databaseIdParam?: string;
  initialRoute?: string;
}

async function setup({
  databaseIdParam = "",
  initialRoute = `/${databaseIdParam}`,
}: SetupOpts = {}) {
  const mockEventListener = jest.spyOn(window, "addEventListener");

  setupDatabasesEndpoints([]);

  const settings = mockSettings({
    engines: ENGINES_MOCK,
    "token-features": createMockTokenFeatures({
      cache_granular_controls: true,
    }),
  });

  const { history } = renderWithProviders(
    <Route path="/">
      <Route path="/home" component={MockComponent} />
      <Route path="/admin/databases" component={MockComponent} />
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

  await waitForLoaderToBeRemoved();

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
      await userEvent.type(connectionField, "Test Connection");

      await waitFor(() => {
        expect(saveButton).toBeEnabled();
      });
    });

    it("should trigger beforeunload event when database connection is edited", async () => {
      const { mockEventListener } = await setup();

      const displayNameInput = await screen.findByLabelText("Display name");

      await userEvent.type(displayNameInput, "Test database");
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

    it("does not show custom warning modal when leaving with no changes via SPA navigation", async () => {
      const { history } = await setup({ initialRoute: "/home" });

      history.push("/");

      await waitForLoaderToBeRemoved();

      const displayNameInput = await screen.findByLabelText("Display name");
      await userEvent.type(displayNameInput, "ab");
      await userEvent.type(displayNameInput, "{backspace}{backspace}");

      history.goBack();

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
      const { history } = await setup({ initialRoute: "/home" });

      history.push("/");

      await waitForLoaderToBeRemoved();

      const displayNameInput = await screen.findByLabelText("Display name");
      await userEvent.type(displayNameInput, "Test database");

      history.goBack();

      expect(
        await screen.findByTestId("leave-confirmation"),
      ).toBeInTheDocument();
    });

    it("does not show custom warning modal after creating new database connection", async () => {
      const { history } = await setup({ initialRoute: "/home" });

      history.push("/");

      await waitForLoaderToBeRemoved();

      const displayNameInput = await screen.findByLabelText("Display name");
      await userEvent.type(displayNameInput, "Test database");
      const connectionStringInput = await screen.findByLabelText(
        "Connection String",
      );
      await userEvent.type(
        connectionStringInput,
        "file:/sample-database.db;USER=GUEST;PASSWORD=guest",
      );

      await userEvent.click(await screen.findByText("Save"));

      await waitFor(() => {
        expect(history.getCurrentLocation().pathname).toEqual(
          "/admin/databases",
        );
      });

      expect(history.getCurrentLocation().search).toContain("created=true");
      expect(history.getCurrentLocation().search).toContain("createdDbId"); //Enpoint doesn't return an ID

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });
});
