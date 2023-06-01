import { IndexRoute, Route } from "react-router";

import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  waitFor,
} from "__support__/ui";
import { setupEnterpriseTest } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";

import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { setupDatabaseEndpoints } from "__support__/server-mocks";

import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import { callMockEvent } from "__support__/events";
import DatabaseEditApp from "./DatabaseEditApp";

const ENGINES_MOCK = {
  H2: {
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

async function setup({ cachingEnabled = false, databaseIdParam = "" } = {}) {
  const mockEventListener = jest.spyOn(window, "addEventListener");

  const settings = mockSettings({
    engines: ENGINES_MOCK,
    "token-features": createMockTokenFeatures({ advanced_config: true }),
    "enable-query-caching": cachingEnabled,
  });

  renderWithProviders(
    <Route path="/">
      <IndexRoute component={DatabaseEditApp} />
      <Route path=":databaseId" component={DatabaseEditApp} />
    </Route>,
    {
      withRouter: true,
      initialRoute: `/${databaseIdParam}`,
      storeInitialState: {
        settings,
      },
    },
  );

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

  return { mockEventListener };
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
