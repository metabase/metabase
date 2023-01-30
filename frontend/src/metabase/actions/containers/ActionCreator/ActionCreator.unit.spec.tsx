import React from "react";
import nock from "nock";

import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { SAMPLE_DATABASE } from "__support__/sample_database_fixture";

import {
  createMockActionParameter,
  createMockQueryAction,
} from "metabase-types/api/mocks";
import type { WritebackQueryAction } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";
import type Table from "metabase-lib/metadata/Table";

import ActionCreator from "./ActionCreator";

function getDatabaseObject(database: Database) {
  return {
    ...database.getPlainObject(),
    tables: database.tables.map(getTableObject),
  };
}

function getTableObject(table: Table) {
  return {
    ...table.getPlainObject(),
    schema: table.schema_name,
  };
}

type SetupOpts = {
  action?: WritebackQueryAction;
};

async function setup({ action }: SetupOpts = {}) {
  const scope = nock(location.origin);

  setupDatabasesEndpoints(scope, [getDatabaseObject(SAMPLE_DATABASE)]);

  if (action) {
    scope.get(`/api/action/${action.id}`).reply(200, action);
  }

  renderWithProviders(<ActionCreator actionId={action?.id} />, {
    withSampleDatabase: true,
  });

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );
}

async function setupEditing({
  action = createMockQueryAction(),
  ...opts
} = {}) {
  await setup({ action, ...opts });
  return { action };
}

describe("ActionCreator", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("new action", () => {
    it("renders correctly", async () => {
      await setup();

      expect(screen.getByText(/New action/i)).toBeInTheDocument();
      expect(screen.getByText(SAMPLE_DATABASE.name)).toBeInTheDocument();
      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("should disable submit by default", async () => {
      await setup();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });
  });

  describe("editing action", () => {
    it("renders correctly", async () => {
      const { action } = await setupEditing();

      expect(screen.getByText(action.name)).toBeInTheDocument();
      expect(screen.queryByText(/New action/i)).not.toBeInTheDocument();
      expect(screen.getByText(SAMPLE_DATABASE.name)).toBeInTheDocument();
      expect(
        screen.getByTestId("mock-native-query-editor"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Update" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("renders parameters", async () => {
      const action = createMockQueryAction({
        parameters: [createMockActionParameter({ name: "FooBar" })],
      });
      await setupEditing({ action });

      expect(screen.getByText("FooBar")).toBeInTheDocument();
    });
  });
});
