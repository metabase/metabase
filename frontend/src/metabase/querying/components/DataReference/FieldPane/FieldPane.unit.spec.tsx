import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupFieldValuesEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card } from "metabase-types/api";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  PRODUCT_EAT_VALUES,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { DataReferenceFieldItem } from "../types";

import { FieldPane } from "./FieldPane";

const CARD_ID = 1;
const STAGE_INDEX = -1;

interface SetupOpts {
  item: DataReferenceFieldItem;
  card?: Card;
}

const setup = async ({ item, card }: SetupOpts) => {
  const database = createSampleDatabase();
  setupDatabaseEndpoints(database);
  setupFieldValuesEndpoint(PRODUCT_EAT_VALUES);
  if (card) {
    setupCardEndpoints(card);
    setupCardQueryMetadataEndpoint(card, {
      databases: [database],
      tables: [],
      fields: [],
      cards: [],
    });
  }

  renderWithProviders(
    <FieldPane {...item} onItemClick={jest.fn()} onClose={jest.fn()} />,
  );
  await waitForLoaderToBeRemoved();
};

describe("FieldPane", () => {
  it("should show column of question with aggregation (metabase#86298)", async () => {
    await setup({
      item: { type: "field", kind: "card", cardId: CARD_ID, columnIndex: 0 },
      card: createMockCard({
        id: CARD_ID,
        database_id: SAMPLE_DB_ID,
        result_metadata: [
          createMockColumn({
            id: undefined,
            name: "count",
            display_name: "Count",
            description: "Number of orders",
            base_type: "type/BigInteger",
            effective_type: "type/BigInteger",
            semantic_type: "type/Quantity",
            field_ref: ["aggregation", 0],
          }),
        ],
      }),
    });

    expect(screen.getByText("count")).toBeInTheDocument();
    expect(screen.getByText("Number of orders")).toBeInTheDocument();
  });

  it("should show table column at given index", async () => {
    const columnIndex = 2;
    const tableMetadata = checkNotNull(
      Lib.tableOrCardMetadata(SAMPLE_PROVIDER, PRODUCTS_ID),
    );
    const query = Lib.queryFromTableOrCardMetadata(
      SAMPLE_PROVIDER,
      tableMetadata,
    );
    const column = Lib.returnedColumns(query, STAGE_INDEX)[columnIndex];
    const { name } = Lib.displayInfo(query, STAGE_INDEX, column);

    await setup({
      item: { type: "field", kind: "table", tableId: PRODUCTS_ID, columnIndex },
    });

    expect(screen.getByText(name)).toBeInTheDocument();
  });

  it("should show error for missing column index", async () => {
    await setup({
      item: {
        type: "field",
        kind: "table",
        tableId: PRODUCTS_ID,
        columnIndex: 100,
      },
    });

    expect(
      screen.getByText("Failed to load field metadata"),
    ).toBeInTheDocument();
  });
});
