import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  PRODUCTS,
  PRODUCT_CATEGORY_VALUES,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import Dimension from "metabase-lib/Dimension";

import { DimensionInfo } from "./DimensionInfo";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(state);

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY, null],
  metadata,
);

const expressionDimension = Dimension.parseMBQL(
  ["expression", "Hello World"],
  metadata,
);

function setup(dimension) {
  setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);
  return renderWithProviders(<DimensionInfo dimension={dimension} />, {
    storeInitialState: state,
  });
}

describe("DimensionInfo", () => {
  it("should show the given dimension's semantic type name", async () => {
    setup(fieldDimension);

    expect(await screen.findByText("Category")).toBeInTheDocument();
  });

  it("should display the given dimension's description", async () => {
    const field = metadata.field(PRODUCTS.CATEGORY);
    setup(fieldDimension);

    expect(await screen.findByText(field.description)).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    setup(expressionDimension);

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
