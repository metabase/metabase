import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupSchemaEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Collection, Measure, Table } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockMeasure,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  DataModelMeasureBreadcrumbs,
  PublishedTableMeasureBreadcrumbs,
} from "./MeasureBreadcrumbs";

const SINGLE_SCHEMA_DB = createMockDatabase({
  id: 1,
  name: "Sample Database",
  tables: [createMockTable({ schema: "PUBLIC" })],
});

const TEST_TABLE = createMockTable({
  id: 42,
  db_id: SINGLE_SCHEMA_DB.id,
  db: SINGLE_SCHEMA_DB,
  display_name: "Orders",
  schema: "PUBLIC",
  collection_id: 1,
});

const TEST_MEASURE = createMockMeasure({
  id: 1,
  name: "Total Revenue",
  table_id: TEST_TABLE.id,
});

describe("PublishedTableMeasureBreadcrumbs", () => {
  function setup({
    table = TEST_TABLE,
    measure,
    collection = createMockCollection({
      id: 1,
      name: "Data",
      effective_ancestors: [],
    }),
  }: {
    table?: Table;
    measure?: Measure;
    collection?: Collection | null;
  } = {}) {
    if (collection) {
      setupCollectionByIdEndpoint({ collections: [collection] });
    }

    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
        )}
      />,
      { withRouter: true },
    );
  }

  it("renders collection as link, table as link to measures, and measure as text", async () => {
    setup({ measure: TEST_MEASURE });

    await waitFor(() => {
      expect(screen.getByText("Data")).toBeInTheDocument();
    });

    const collectionLink = screen.getByText("Data").closest("a");
    expect(collectionLink).toHaveAttribute("href", "/data-studio/library");

    const tableLink = screen.getByText("Orders").closest("a");
    expect(tableLink).toHaveAttribute(
      "href",
      `/data-studio/library/tables/${TEST_TABLE.id}/measures`,
    );

    const measureText = screen.getByText("Total Revenue");
    expect(measureText.closest("a")).toBeNull();
  });

  it("renders ancestor chain with separators and correct links", async () => {
    const grandparent = createMockCollection({ id: 3, name: "Root" });
    const parent = createMockCollection({
      id: 2,
      name: "Analytics",
      effective_ancestors: [grandparent],
    });
    const collection = createMockCollection({
      id: 1,
      name: "Sales",
      effective_ancestors: [grandparent, parent],
    });

    setup({ collection });

    await waitFor(() => {
      expect(screen.getByText("Root")).toBeInTheDocument();
    });

    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();

    expect(screen.getByText("Root").closest("a")).toHaveAttribute(
      "href",
      `/data-studio/library`,
    );
    expect(screen.getByText("Analytics").closest("a")).toHaveAttribute(
      "href",
      `/data-studio/library?expandedId=${parent.id}`,
    );
  });

  it("uses display_name for table and renders 'New measure' when measure undefined", async () => {
    const tableWithDifferentNames = createMockTable({
      ...TEST_TABLE,
      name: "orders_table",
      display_name: "Customer Orders",
    });

    setup({ table: tableWithDifferentNames, measure: undefined });

    await waitFor(() => {
      expect(screen.getByText("Customer Orders")).toBeInTheDocument();
    });

    expect(screen.queryByText("orders_table")).not.toBeInTheDocument();
    const newMeasureText = screen.getByText("New measure");
    expect(newMeasureText).toBeInTheDocument();
    expect(newMeasureText.closest("a")).toBeNull();
  });

  it("renders without collection when collection_id is null", async () => {
    const tableNoCollection = createMockTable({
      ...TEST_TABLE,
      id: 44,
      display_name: "Unpublished Table",
      collection_id: null,
    });

    setup({ table: tableNoCollection, collection: null });

    await waitFor(() => {
      expect(screen.getByText("Unpublished Table")).toBeInTheDocument();
    });
  });
});

describe("DataModelMeasureBreadcrumbs", () => {
  function setup({
    table = TEST_TABLE,
    measure,
  }: {
    table?: Table;
    measure?: Measure;
  } = {}) {
    setupTablesEndpoints([table]);
    setupSchemaEndpoints(checkNotNull(table.db));

    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <DataModelMeasureBreadcrumbs table={table} measure={measure} />
        )}
      />,
      { withRouter: true },
    );
  }

  it("renders database as link, table as link to measures tab, and measure as text", async () => {
    setup({ measure: TEST_MEASURE });

    await waitFor(() => {
      expect(screen.getByText("Sample Database")).toBeInTheDocument();
    });

    const dbLink = screen.getByText("Sample Database").closest("a");
    expect(dbLink).toHaveAttribute(
      "href",
      `/data-studio/data/database/${SINGLE_SCHEMA_DB.id}`,
    );

    const tableLink = screen.getByText("Orders").closest("a");
    expect(tableLink).toHaveAttribute(
      "href",
      `/data-studio/data/database/${SINGLE_SCHEMA_DB.id}/schema/${SINGLE_SCHEMA_DB.id}:PUBLIC/table/${TEST_TABLE.id}/measures`,
    );

    const measureText = screen.getByText("Total Revenue");
    expect(measureText.closest("a")).toBeNull();
  });

  it("hides schema when single schema, shows separators, and renders 'New measure' when undefined", async () => {
    setup({ measure: undefined });

    await waitFor(() => {
      expect(screen.getByText("Sample Database")).toBeInTheDocument();
    });

    expect(screen.queryByText("PUBLIC")).not.toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("New measure")).toBeInTheDocument();
  });
});
