import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database, TableId } from "metabase-types/api";
import { createMockForeignKey } from "metabase-types/api/mocks";
import {
  createOrdersProductIdField,
  createOrdersTable,
  createProductsIdField,
  createProductsTable,
  createReviewsProductIdField,
  createReviewsTable,
  createSampleDatabase,
  ORDERS,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { Relationships } from "./ObjectRelationships";
import type { ForeignKeyReferences } from "./types";

const SINGLE_TABLE_DATABASE = createSampleDatabase({
  tables: [createProductsTable()],
});

const MULTI_TABLE_DATABASE = createSampleDatabase({
  tables: [
    createProductsTable({
      fks: [
        createMockForeignKey({
          origin_id: ORDERS.PRODUCT_ID,
          origin: createOrdersProductIdField(),
          destination_id: PRODUCTS.ID,
          destination: createProductsIdField(),
        }),
        createMockForeignKey({
          origin_id: REVIEWS.PRODUCT_ID,
          origin: createReviewsProductIdField(),
          destination_id: PRODUCTS.ID,
          destination: createProductsIdField(),
        }),
      ],
    }),
    createOrdersTable(),
    createReviewsTable(),
  ],
});

const FOREIGN_KEY_REFERENCES = {
  [ORDERS.PRODUCT_ID]: { status: 1, value: 771 },
  [REVIEWS.PRODUCT_ID]: { status: 1, value: 881 },
};

interface SetupOpts {
  database: Database;
  tableId: TableId;
  tableForeignKeyReferences?: ForeignKeyReferences;
}

const setup = ({
  database,
  tableId,
  tableForeignKeyReferences = {},
}: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });

  const metadata = getMetadata(state);
  const table = metadata.table(tableId);

  renderWithProviders(
    <div data-testid="container">
      <Relationships
        objectName="Large Sandstone Socks"
        tableForeignKeys={table?.fks ?? []}
        tableForeignKeyReferences={tableForeignKeyReferences}
        foreignKeyClicked={() => null}
      />
    </div>,
    { storeInitialState: state },
  );
};

describe("Object Relationships", () => {
  it("renders null if no foreign keys are provided", () => {
    setup({ database: SINGLE_TABLE_DATABASE, tableId: PRODUCTS_ID });
    expect(screen.getByTestId("container")).toBeEmptyDOMElement();
  });

  it("renders a list of relationships", () => {
    setup({
      database: MULTI_TABLE_DATABASE,
      tableId: PRODUCTS_ID,
      tableForeignKeyReferences: FOREIGN_KEY_REFERENCES,
    });

    expect(screen.getByText(/Large Sandstone Socks/i)).toBeInTheDocument();
    expect(screen.getByText("771")).toBeInTheDocument();
    expect(screen.getByText(/Orders/i)).toBeInTheDocument();
    expect(screen.getByText("881")).toBeInTheDocument();
    expect(screen.getByText(/Reviews/i)).toBeInTheDocument();
  });
});
