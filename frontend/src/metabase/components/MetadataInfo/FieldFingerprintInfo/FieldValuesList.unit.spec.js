import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS, metadata } from "__support__/sample_dataset_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import FieldValuesList from "./FieldValuesList";

const categoryField = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
).field();

const mockFetchFieldValues = jest.fn();
function setup(field, fieldValues) {
  mockFetchFieldValues.mockReset();
  return render(
    <FieldValuesList
      field={field}
      fieldValues={fieldValues}
      fetchFieldValues={mockFetchFieldValues}
    />,
  );
}

describe("FieldValuesList", () => {
  it("should return nothing when there are no values", () => {
    const { container } = setup(categoryField, []);
    expect(container.firstChild).toBeNull();
  });

  it("should return a formatted values list", () => {
    setup(categoryField, ["foo", "bar"]);
    expect(screen.getByText("foo, bar")).toBeInTheDocument();
  });

  it("should return a shortened, formatted values list", () => {
    setup(categoryField, Array(50).fill("a"));
    expect(
      screen.getByText(
        Array(35)
          .fill("a")
          .join(", "),
      ),
    ).toBeInTheDocument();
  });
});
