import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupSchemaEndpoints,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { checkNotNull } from "metabase/lib/types";
import type { Segment, Table } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

import {
  DataModelSegmentBreadcrumbs,
  PublishedTableSegmentBreadcrumbs,
} from "./SegmentBreadcrumbs";

const SINGLE_SCHEMA_DB = createMockDatabase({
  id: 1,
  name: "Sample Database",
  tables: [createMockTable({ schema: "PUBLIC" })],
});

const TEST_COLLECTION = createMockCollection({
  id: 1,
  name: "Data",
  effective_ancestors: [
    createMockCollection(ROOT_COLLECTION),
    createMockCollection({ id: 2, name: "Library", type: "library" }),
  ],
});

const TEST_TABLE = createMockTable({
  id: 42,
  db_id: SINGLE_SCHEMA_DB.id,
  db: SINGLE_SCHEMA_DB,
  display_name: "Orders",
  schema: "PUBLIC",
  collection_id: TEST_COLLECTION.id,
  collection: TEST_COLLECTION,
});

const TEST_SEGMENT = createMockSegment({
  id: 1,
  name: "High Value Orders",
  table_id: TEST_TABLE.id,
});

describe("PublishedTableSegmentBreadcrumbs", () => {
  function setup({
    table = TEST_TABLE,
    segment,
  }: {
    table?: Table;
    segment?: Segment;
  } = {}) {
    setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
        )}
      />,
      { withRouter: true },
    );
  }

  it("renders collection as link, table as link to segments, and segment as text", async () => {
    setup({ segment: TEST_SEGMENT });

    await waitFor(() => {
      expect(screen.getByText("Data")).toBeInTheDocument();
    });

    const collectionLink = screen.getByText("Data").closest("a");
    expect(collectionLink).toHaveAttribute(
      "href",
      `/data-studio/library?expandedId=${TEST_COLLECTION.id}`,
    );

    const tableLink = screen.getByText("Orders").closest("a");
    expect(tableLink).toHaveAttribute(
      "href",
      `/data-studio/library/tables/${TEST_TABLE.id}/segments`,
    );

    const segmentText = screen.getByText("High Value Orders");
    expect(segmentText.closest("a")).toBeNull();
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

    const tableWithAncestors = createMockTable({
      ...TEST_TABLE,
      collection_id: collection.id,
      collection,
    });

    setupCollectionByIdEndpoint({ collections: [collection] });

    setup({ table: tableWithAncestors });

    await waitFor(() => {
      expect(screen.getByText("Root")).toBeInTheDocument();
    });

    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();

    expect(screen.getByText("Root").closest("a")).toHaveAttribute(
      "href",
      "/data-studio/library",
    );
    expect(screen.getByText("Analytics").closest("a")).toHaveAttribute(
      "href",
      `/data-studio/library?expandedId=${parent.id}`,
    );
  });

  it("uses display_name for table and renders 'New segment' when segment undefined", async () => {
    const tableWithDifferentNames = createMockTable({
      ...TEST_TABLE,
      name: "orders_table",
      display_name: "Customer Orders",
    });

    setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });

    setup({ table: tableWithDifferentNames, segment: undefined });

    await waitFor(() => {
      expect(screen.getByText("Customer Orders")).toBeInTheDocument();
    });

    expect(screen.queryByText("orders_table")).not.toBeInTheDocument();
    const newSegmentText = screen.getByText("New segment");
    expect(newSegmentText).toBeInTheDocument();
    expect(newSegmentText.closest("a")).toBeNull();
  });

  it("renders without collection when collection_id is null", async () => {
    const tableNoCollection = createMockTable({
      ...TEST_TABLE,
      id: 44,
      display_name: "Unpublished Table",
      collection_id: null,
      collection: undefined,
    });

    setup({ table: tableNoCollection });

    await waitFor(() => {
      expect(screen.getByText("Unpublished Table")).toBeInTheDocument();
    });
  });
});

describe("DataModelSegmentBreadcrumbs", () => {
  function setup({
    table = TEST_TABLE,
    segment,
  }: {
    table?: Table;
    segment?: Segment;
  } = {}) {
    setupTablesEndpoints([table]);
    setupSchemaEndpoints(checkNotNull(table.db));

    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <DataModelSegmentBreadcrumbs table={table} segment={segment} />
        )}
      />,
      { withRouter: true },
    );
  }

  it("renders database as link, table as link to segments tab, and segment as text", async () => {
    setup({ segment: TEST_SEGMENT });

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
      `/data-studio/data/database/${SINGLE_SCHEMA_DB.id}/schema/${SINGLE_SCHEMA_DB.id}:PUBLIC/table/${TEST_TABLE.id}/segments`,
    );

    const segmentText = screen.getByText("High Value Orders");
    expect(segmentText.closest("a")).toBeNull();
  });

  it("hides schema when single schema, shows separators, and renders 'New segment' when undefined", async () => {
    setup({ segment: undefined });

    await waitFor(() => {
      expect(screen.getByText("Sample Database")).toBeVisible();
    });

    expect(screen.queryByText("PUBLIC")).not.toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("New segment")).toBeInTheDocument();
  });
});
