import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import Dimension from "metabase-lib/Dimension";
import { CategoryFingerprint } from "./CategoryFingerprint";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = getMetadata(state);

const categoryField = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY, null],
  metadata,
).field();

const mockFetchFieldValues = jest.fn();
function setup({
  field,
  fieldValues,
  fingerprint,
  fetchFieldValues = mockFetchFieldValues,
}) {
  categoryField.fingerprint = fingerprint;
  mockFetchFieldValues.mockReset();
  return render(
    <CategoryFingerprint
      field={field}
      fieldValues={fieldValues}
      fetchFieldValues={mockFetchFieldValues}
    />,
  );
}

describe("CategoryFingerprint", () => {
  describe("when the field does not have a `has_field_values` value of 'list'", () => {
    beforeEach(() => {
      categoryField.has_field_values = "search";
    });

    it("should not fetch field values when field values are empty", () => {
      setup({
        field: categoryField,
      });
      expect(mockFetchFieldValues).not.toHaveBeenCalled();
    });

    it("should show a distinct count when available", () => {
      setup({
        field: categoryField,
        fingerprint: {
          global: {
            "distinct-count": 10,
          },
        },
      });

      expect(screen.getByText("10 distinct values")).toBeVisible();
    });

    it("should not show a distinct count when the fingerprint value is unavailable", () => {
      const { container } = setup({ field: categoryField });
      expect(container).toBeEmptyDOMElement();
    });

    it("should show field values if for whatever reason some are present", () => {
      setup({
        field: categoryField,
        fieldValues: ["foo", "bar"],
      });
      expect(screen.getByText("foo, bar")).toBeVisible();
    });
  });

  describe("when the field has a `has_field_values` value of 'list'", () => {
    beforeEach(() => {
      categoryField.has_field_values = "list";
    });

    it("should fetch field values when field values are empty", () => {
      setup({
        field: categoryField,
      });
      expect(mockFetchFieldValues).toHaveBeenCalledWith({
        id: categoryField.id,
      });
    });

    it("should not fetch field values when field values are presnet", () => {
      setup({
        field: categoryField,
        fieldValues: ["foo", "bar"],
      });
      expect(mockFetchFieldValues).not.toHaveBeenCalled();
    });

    it("should show a loading state while fetching", () => {
      setup({
        field: categoryField,
        fetchFieldValues: () => new Promise(),
      });
      expect(screen.getByText("Getting distinct values...")).toBeVisible();
    });

    it("should show a distinct count when available", () => {
      setup({
        field: categoryField,
        fieldValues: ["foo", "bar"],
        fingerprint: {
          global: {
            "distinct-count": 2,
          },
        },
      });

      expect(screen.getByText("2 distinct values")).toBeVisible();
    });

    it("should not show a distinct count when the fingerprint value is unavailable", () => {
      const { container } = setup({
        field: categoryField,
        fieldValues: ["foo"],
      });
      expect(container).toHaveTextContent("foo");
    });
  });
});
