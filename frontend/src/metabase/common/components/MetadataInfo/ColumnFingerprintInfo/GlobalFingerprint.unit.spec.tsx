import { setupFieldValuesEndpoint } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { FieldId } from "metabase-types/api";
import {
  PEOPLE,
  PRODUCTS,
  PRODUCT_CATEGORY_VALUES,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { GlobalFingerprint } from "./GlobalFingerprint";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

function setup(fieldId: FieldId) {
  setupFieldValuesEndpoint(PRODUCT_CATEGORY_VALUES);

  renderWithProviders(<GlobalFingerprint fieldId={fieldId} />, {
    storeInitialState: state,
  });
}

describe("GlobalFingerprint", () => {
  describe("when the field does not have a `has_field_values` value of 'list'", () => {
    it("should not fetch field values when field values are empty", () => {
      setup(PEOPLE.ADDRESS);
      expect(
        screen.queryByText("Getting distinct values..."),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/distinct values/)).toBeInTheDocument();
    });
  });

  describe("when the field has a `has_field_values` value of 'list'", () => {
    it("should fetch field values when field values are empty", async () => {
      setup(PRODUCTS.CATEGORY);

      expect(
        screen.getByText("Getting distinct values..."),
      ).toBeInTheDocument();
      expect(await screen.findByText("4 distinct values")).toBeInTheDocument();
    });
  });

  it("should not throw an error when the field cannot be found", () => {
    setup(99942);
    expect(
      screen.queryByText("Getting distinct values..."),
    ).not.toBeInTheDocument();
  });
});
