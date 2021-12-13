import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS, metadata } from "__support__/sample_dataset_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import { DimensionInfo } from "./DimensionInfo";

const categoryDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
);

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CREATED_AT.id, null],
  metadata,
);

const expressionDimension = Dimension.parseMBQL(
  ["expression", "Hello World"],
  metadata,
);

const mockFetchFieldValues = jest.fn(() => Promise.resolve([]));
function setup(dimension, fieldValues) {
  mockFetchFieldValues.mockReset();
  return render(
    <DimensionInfo
      dimension={dimension}
      fieldValues={fieldValues}
      fetchFieldValues={mockFetchFieldValues}
    />,
  );
}

describe("DimensionInfo", () => {
  it("should show the given dimension's display name", () => {
    setup(expressionDimension);

    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("should display the given dimension's description", () => {
    setup(fieldDimension);

    expect(
      screen.getByText(PRODUCTS.CREATED_AT.description),
    ).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    setup(expressionDimension);

    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("should fetch field values when `fieldValues` is empty and the field is set to list values", () => {
    categoryDimension.field().has_field_values = "list";
    setup(categoryDimension, []);

    expect(mockFetchFieldValues).toHaveBeenCalledWith({
      id: categoryDimension.field().id,
    });
  });

  it("should not fetch field values when `fieldValues` is not empty", () => {
    categoryDimension.field().has_field_values = "list";
    setup(categoryDimension, ["hey"]);

    expect(mockFetchFieldValues).not.toHaveBeenCalled();
  });

  it("should not fetch field values when the field is not set to list values", () => {
    categoryDimension.field().has_field_values = "search";
    setup(categoryDimension, [""]);

    expect(mockFetchFieldValues).not.toHaveBeenCalled();
  });
});
