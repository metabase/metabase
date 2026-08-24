import fetchMock from "fetch-mock";

import {
  setupFieldEndpoints,
  setupFieldValuesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { FieldId } from "metabase-types/api";
import {
  PEOPLE,
  PRODUCTS,
  PRODUCT_CATEGORY_VALUES,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { GlobalFingerprint } from "./GlobalFingerprint";

const SAMPLE_DATABASE_FIELDS = createSampleDatabase().tables?.flatMap(
  (table) => table.fields ?? [],
);

const MISSING_FIELD_ID = 99942;

function setup(fieldId: FieldId) {
  setupFieldValuesEndpoint(PRODUCT_CATEGORY_VALUES);
  SAMPLE_DATABASE_FIELDS?.forEach((field) => setupFieldEndpoints(field));
  fetchMock.get(`path:/api/field/${MISSING_FIELD_ID}`, 404);

  renderWithProviders(<GlobalFingerprint fieldId={fieldId} />);
}

describe("GlobalFingerprint", () => {
  describe("when the field does not have a `has_field_values` value of 'list'", () => {
    it("should not fetch field values when field values are empty", async () => {
      setup(PEOPLE.ADDRESS);
      expect(await screen.findByText(/distinct values/)).toBeInTheDocument();
      expect(
        screen.queryByText("Getting distinct values..."),
      ).not.toBeInTheDocument();
    });
  });

  describe("when the field has a `has_field_values` value of 'list'", () => {
    it("should fetch field values when field values are empty", async () => {
      setup(PRODUCTS.CATEGORY);

      expect(
        await screen.findByText("Getting distinct values..."),
      ).toBeInTheDocument();
      expect(await screen.findByText("4 distinct values")).toBeInTheDocument();
    });
  });

  it("should not throw an error when the field cannot be found", async () => {
    setup(MISSING_FIELD_ID);
    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(`path:/api/field/${MISSING_FIELD_ID}`),
      ).toBe(true),
    );
    expect(
      screen.queryByText("Getting distinct values..."),
    ).not.toBeInTheDocument();
  });
});
