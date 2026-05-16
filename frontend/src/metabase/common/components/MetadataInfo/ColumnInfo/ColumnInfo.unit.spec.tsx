import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";
import type Field from "metabase-lib/v1/metadata/Field";
import {
  PRODUCTS,
  PRODUCT_CATEGORY_VALUES,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QueryColumnInfo, TableColumnInfo } from "./ColumnInfo";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(state);

function setup(field: Field) {
  setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);
  return renderWithProviders(<TableColumnInfo field={field} />, {
    storeInitialState: state,
  });
}

function setupLib(table: string, column: string) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const columns = Lib.visibleColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const col = findColumn(table, column);

  return renderWithProviders(
    <QueryColumnInfo query={query} stageIndex={-1} column={col} />,
  );
}

describe("FieldInfo", () => {
  const categoryField = metadata.field(PRODUCTS.CATEGORY)!;
  const createdAtField = metadata.field(PRODUCTS.CREATED_AT)!;

  it("should show the given dimension's semantic type name", async () => {
    setup(categoryField);

    expect(await screen.findByText("Category")).toBeInTheDocument();
  });

  it("should display the given dimension's description", async () => {
    setup(categoryField);

    expect(
      await screen.findByText(categoryField.description!),
    ).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    setup(createdAtField);

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("FieldInfo (Lib)", () => {
  it("should show the given dimension's semantic type name", async () => {
    setupLib("PRODUCTS", "CATEGORY");

    expect(await screen.findByText("Category")).toBeInTheDocument();
  });

  it("should display the given dimension's description", async () => {
    setupLib("PRODUCTS", "CATEGORY");

    expect(await screen.findByText("The type of product.")).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    setupLib("PRODUCTS", "CREATED_AT");

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
