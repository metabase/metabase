import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { DatabaseId, SchemaName } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTable,
} from "metabase-types/api/mocks";

import { SchemaPickerInput } from "./SchemaPickerInput";

// Schema-less DB (MySQL/Mongo/…): a single nameless schema (`""`).
const SCHEMALESS_DB = createMockDatabase({
  id: 39,
  name: "QA Maria",
  tables: [
    createMockTable({ id: 1, db_id: 39, display_name: "orders", schema: "" }),
    createMockTable({ id: 2, db_id: 39, display_name: "people", schema: "" }),
  ],
});

// DB with multiple named schemas.
const MULTI_SCHEMA_DB = createMockDatabase({
  id: 40,
  name: "QA Postgres",
  tables: [
    createMockTable({
      id: 3,
      db_id: 40,
      display_name: "products",
      schema: "public",
    }),
    createMockTable({
      id: 4,
      db_id: 40,
      display_name: "reviews",
      schema: "public",
    }),
    createMockTable({
      id: 5,
      db_id: 40,
      display_name: "logs",
      schema: "internal",
    }),
  ],
});

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
});

type SetupOpts = {
  databaseId: DatabaseId | undefined;
  schema: SchemaName | undefined;
};

function setup({ databaseId, schema }: SetupOpts) {
  setupDatabasesEndpoints([SCHEMALESS_DB, MULTI_SCHEMA_DB]);
  // These 2 are required for MiniPicker to work.
  mockGetBoundingClientRect();
  setupCollectionByIdEndpoint({ collections: [ROOT_COLLECTION] });

  const onSchemaChange = jest.fn();
  const { history } = renderWithProviders(
    <Route
      path="/"
      component={() => (
        <SchemaPickerInput
          databaseId={databaseId}
          schema={schema}
          onSchemaChange={onSchemaChange}
        />
      )}
    />,
    { withRouter: true },
  );

  return { onSchemaChange, history };
}

describe("SchemaPickerInput", () => {
  describe("label", () => {
    it("shows the placeholder when no database is selected", async () => {
      setup({ databaseId: undefined, schema: undefined });

      expect(
        await screen.findByText("Pick a schema to view"),
      ).toBeInTheDocument();
    });

    it("shows the placeholder when a database is present but no schema is selected", async () => {
      // Restored URL state with `database-id` but no `schema` param parses to
      // `schema === undefined`; nothing has been chosen yet, so it must stay a
      // placeholder rather than showing the database name.
      setup({ databaseId: 39, schema: undefined });

      expect(
        await screen.findByText("Pick a schema to view"),
      ).toBeInTheDocument();
      expect(screen.queryByText("QA Maria")).not.toBeInTheDocument();
    });

    it("shows the schema name when a named schema is selected", async () => {
      setup({ databaseId: 40, schema: "public" });

      expect(
        await screen.findByTestId("schema-picker-button"),
      ).toHaveTextContent("public");
      expect(
        screen.queryByText("Pick a schema to view"),
      ).not.toBeInTheDocument();
    });

    it("shows the database name when the schema is nameless (schema-less db)", async () => {
      setup({ databaseId: 39, schema: "" });

      expect(await screen.findByText("QA Maria")).toBeInTheDocument();
      expect(
        screen.queryByText("Pick a schema to view"),
      ).not.toBeInTheDocument();
    });
  });

  describe("selection flow", () => {
    it("auto-selects a schema-less db, navigates with an empty schema, closes, and reopens at the database list", async () => {
      const { onSchemaChange, history } = setup({
        databaseId: undefined,
        schema: undefined,
      });

      // With no database selected the picker opens automatically.
      await userEvent.click(await screen.findByText("QA Maria"));

      // Single nameless schema is auto-selected; navigation preserves the
      // empty schema (`schema=`) rather than dropping it.
      await waitFor(() => {
        expect(onSchemaChange).toHaveBeenCalled();
      });
      const location = history?.getCurrentLocation();
      const params = new URLSearchParams(location?.search);
      expect(params.get("database-id")).toBe("39");
      expect(params.get("schema")).toBe("");

      // The picker closes after selecting.
      await waitFor(() => {
        expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument();
      });

      // Reopening shows the database list.
      await userEvent.click(screen.getByTestId("schema-picker-button"));
      expect(await screen.findByText("QA Postgres")).toBeInTheDocument();
      expect(screen.getByText("QA Maria")).toBeInTheDocument();
    });

    it("routes a named schema selection with the chosen schema and closes", async () => {
      const { onSchemaChange, history } = setup({
        databaseId: undefined,
        schema: undefined,
      });

      await userEvent.click(await screen.findByText("QA Postgres"));
      await userEvent.click(await screen.findByText("public"));

      await waitFor(() => {
        expect(onSchemaChange).toHaveBeenCalled();
      });
      const location = history?.getCurrentLocation();
      const params = new URLSearchParams(location?.search);
      expect(params.get("database-id")).toBe("40");
      expect(params.get("schema")).toBe("public");

      await waitFor(() => {
        expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument();
      });
    });
  });
});
