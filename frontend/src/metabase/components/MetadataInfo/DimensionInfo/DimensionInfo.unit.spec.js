import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS, metadata } from "__support__/sample_database_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import { DimensionInfo } from "./DimensionInfo";

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CATEGORY.id, null],
  metadata,
);

const expressionDimension = Dimension.parseMBQL(
  ["expression", "Hello World"],
  metadata,
);

function setup(dimension, fieldValues) {
  return render(<DimensionInfo dimension={dimension} />);
}

describe("DimensionInfo", () => {
  it("should show the given dimension's semantic type name", () => {
    setup(fieldDimension);

    expect(screen.getByText("Category")).toBeInTheDocument();
  });

  it("should display the given dimension's description", () => {
    setup(fieldDimension);

    expect(screen.getByText(PRODUCTS.CATEGORY.description)).toBeInTheDocument();
  });

  it("should show a placeholder for a dimension with no description", () => {
    setup(expressionDimension);

    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
