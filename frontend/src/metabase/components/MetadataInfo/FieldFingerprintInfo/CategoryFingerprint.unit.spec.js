import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS, metadata } from "__support__/sample_database_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import { CategoryFingerprint } from "./CategoryFingerprint";

const categoryField = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
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
      expect(container.firstChild).toBeNull();
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
      expect(container.textContent).toEqual("foo");
    });
  });
});
