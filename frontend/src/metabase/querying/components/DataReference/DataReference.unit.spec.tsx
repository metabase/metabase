import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupFieldValuesEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card, Table } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockFieldValues,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersQuantityField,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataReference } from "./DataReference";
import type { DataReferenceItem } from "./types";

const ORDERS_DESCRIPTION =
  "Confirmed Sample Company orders for a product, from a user.";
const QUANTITY_DESCRIPTION = "Number of products bought.";

const COLLECTION = createMockCollection({ id: 5, name: "Personal" });

const METRIC = createMockCard({
  id: 20,
  name: "Count of orders",
  type: "metric",
  description: "A metric",
  collection_id: COLLECTION.id,
});

const MODEL = createMockCard({
  id: 21,
  name: "Native Products Model",
  type: "model",
  description: "A model of the Products table",
  collection_id: COLLECTION.id,
  query_type: "native",
  dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: "SELECT ID AS RENAMED_ID FROM PRODUCTS",
  }),
  result_metadata: [
    createMockColumn({
      id: PRODUCTS.ID,
      name: "RENAMED_ID",
      display_name: "RENAMED_ID",
      base_type: "type/BigInteger",
      description: null,
    }),
  ],
});

interface SetupOpts {
  initialStack: DataReferenceItem[];
  ordersTable?: Table;
  cards?: Card[];
}

function setup({
  initialStack,
  ordersTable = getOrdersTable(),
  cards = [],
}: SetupOpts) {
  const sampleDatabase = createSampleDatabase();
  const database = {
    ...sampleDatabase,
    tables: sampleDatabase.tables?.map((table) =>
      table.id === ordersTable.id ? ordersTable : table,
    ),
  };
  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);
  setupFieldValuesEndpoint(
    createMockFieldValues({ field_id: ORDERS.QUANTITY, values: [] }),
  );
  setupFieldValuesEndpoint(
    createMockFieldValues({ field_id: PRODUCTS.ID, values: [] }),
  );
  setupCollectionByIdEndpoint({ collections: [COLLECTION] });
  cards.forEach((card) => {
    setupCardEndpoints(card);
    setupCardQueryMetadataEndpoint(
      card,
      createMockCardQueryMetadata({ databases: [database] }),
    );
  });

  function DataReferenceWithStack() {
    const [stack, setStack] = useState(initialStack);
    return (
      <DataReference
        dataReferenceStack={stack}
        pushDataReferenceStack={(item) => setStack([...stack, item])}
        popDataReferenceStack={() => setStack(stack.slice(0, -1))}
        databaseId={database.id}
      />
    );
  }

  renderWithProviders(<DataReferenceWithStack />);
}

function getOrdersTable(opts?: Partial<Table>) {
  const table = createOrdersTable();
  return {
    ...table,
    description: ORDERS_DESCRIPTION,
    metrics: [],
    fields: table.fields?.map((field) =>
      field.id === ORDERS.QUANTITY
        ? createOrdersQuantityField({ description: QUANTITY_DESCRIPTION })
        : field,
    ),
    ...opts,
  };
}

const getHeaderTitle = () => screen.getByTestId("sidebar-header-title");

describe("DataReference", () => {
  it("shows a table and its fields, and navigates back to the start", async () => {
    setup({
      initialStack: [
        { type: "database", id: SAMPLE_DB_ID },
        { type: "table", id: ORDERS_ID },
      ],
    });

    expect(await screen.findByText(ORDERS_DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByText("9 columns")).toBeInTheDocument();
    expect(screen.queryByText(/metric/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("QUANTITY"));
    expect(await screen.findByText(QUANTITY_DESCRIPTION)).toBeInTheDocument();

    await userEvent.click(getHeaderTitle());
    expect(await screen.findByText(ORDERS_DESCRIPTION)).toBeInTheDocument();

    await userEvent.click(getHeaderTitle());
    expect(await screen.findByText("Sample Database")).toBeInTheDocument();

    await userEvent.click(getHeaderTitle());
    expect(await screen.findByText("Data Reference")).toBeInTheDocument();
  });

  it("shows the metrics of a table", async () => {
    setup({
      initialStack: [{ type: "table", id: ORDERS_ID }],
      ordersTable: getOrdersTable({ metrics: [METRIC] }),
      cards: [METRIC],
    });

    expect(await screen.findByText("1 metric")).toBeInTheDocument();

    await userEvent.click(screen.getByText(METRIC.name));
    expect(await screen.findByText("A metric")).toBeInTheDocument();

    await userEvent.click(getHeaderTitle());
    expect(await screen.findByText("1 metric")).toBeInTheDocument();
  });

  it("shows a model, its columns and their details", async () => {
    setup({
      initialStack: [{ type: "question", id: MODEL.id }],
      cards: [MODEL],
    });

    expect(
      await screen.findByText("A model of the Products table"),
    ).toBeInTheDocument();
    expect(await screen.findByText(COLLECTION.name)).toBeInTheDocument();
    expect(screen.getByText("1 column")).toBeInTheDocument();

    await userEvent.click(screen.getByText("RENAMED_ID"));
    expect(await screen.findByText("No description")).toBeInTheDocument();
    expect(getHeaderTitle()).toHaveTextContent("RENAMED_ID");
  });
});
