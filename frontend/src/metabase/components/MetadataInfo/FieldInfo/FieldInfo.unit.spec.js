import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  PRODUCT_CATEGORY_VALUES,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { FieldInfo } from "./FieldInfo";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(state);

function setup(field) {
  setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);
  return renderWithProviders(<FieldInfo field={field} />, {
    storeInitialState: state,
  });
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
