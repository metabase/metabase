import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import {
  createSampleDatabase,
  PRODUCT_CATEGORY_VALUES,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { QueryColumnInfo, TableColumnInfo } from "./ColumnInfo";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(state);

function setup(field) {
  setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);
  return renderWithProviders(<TableColumnInfo field={field} />, {
    storeInitialState: state,
  });
}

function setupMLv2(table, column) {
  const query = createQuery();
  const columns = Lib.visibleColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const col = findColumn(table, column);

  return renderWithProviders(
    <QueryColumnInfo query={query} stageIndex={-1} column={col} />,
  );
}

describe("FieldInfo", () => {
  it("should show the given dimension's semantic type name", async () => {
    const field = metadata.field(PRODUCTS.CATEGORY);
    setup(field);

    expect(await screen.findByText("Category")).toBeInTheDocument();
  });

  it("should display the given dimension's description", async () => {
    const field = metadata.field(PRODUCTS.CATEGORY);
    setup(field);

    expect(await screen.findByText(field.description)).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    const field = metadata.field(PRODUCTS.CREATED_AT);
    setup(field);

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("FieldInfo (MLv2)", () => {
  it("should show the given dimension's semantic type name", async () => {
    setupMLv2("PRODUCTS", "CATEGORY");

    expect(await screen.findByText("Category")).toBeInTheDocument();
  });

  it("should display the given dimension's description", async () => {
    setupMLv2("PRODUCTS", "CATEGORY");

    expect(await screen.findByText("The type of product.")).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    setupMLv2("PRODUCTS", "CREATED_AT");

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
