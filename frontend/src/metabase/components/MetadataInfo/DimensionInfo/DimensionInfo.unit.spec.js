import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS, metadata } from "__support__/sample_dataset_fixture";
import Dimension from "metabase-lib/lib/Dimension";

import DimensionInfo from "./DimensionInfo";

const fieldDimension = Dimension.parseMBQL(
  ["field", PRODUCTS.CREATED_AT.id, null],
  metadata,
);

const expressionDimension = Dimension.parseMBQL(
  ["expression", "Hello World"],
  metadata,
);

function setup(dimension) {
  return render(<DimensionInfo dimension={dimension} />);
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
});
