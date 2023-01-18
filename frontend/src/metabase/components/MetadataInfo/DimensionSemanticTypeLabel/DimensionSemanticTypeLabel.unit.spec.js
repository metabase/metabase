import React from "react";

import { render, screen, getIcon } from "__support__/ui";
import {
  PRODUCTS,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";

import Dimension from "metabase-lib/Dimension";
import DimensionSemanticTypeLabel from "./DimensionSemanticTypeLabel";

function setup(dimension) {
  return render(<DimensionSemanticTypeLabel dimension={dimension} />);
}

describe("DimensionSemanticTypeLabel", () => {
  describe("given a dimension with a semantic type", () => {
    const fieldDimension = Dimension.parseMBQL(
      ["field", PRODUCTS.CREATED_AT.id, null],
      metadata,
    );
    fieldDimension.field().semantic_type = "type/CreationDate";

    it("should show an icon corresponding to the given semantic type", () => {
      setup(fieldDimension);
      expect(getIcon("calendar")).toBeInTheDocument();
    });

    it("should display the name of the semantic type", () => {
      setup(fieldDimension);
      expect(screen.getByText("Creation date")).toBeInTheDocument();
    });
  });

  describe("given a dimension without a semantic type", () => {
    const fieldDimension = Dimension.parseMBQL(
      ["field", ORDERS.TAX.id, null],
      metadata,
    );

    it("should show an ellipsis icon representing the lack of semantic type", () => {
      setup(fieldDimension);
      expect(getIcon("ellipsis")).toBeInTheDocument();
    });

    it("should display the given dimension's display name", () => {
      setup(fieldDimension);
      expect(screen.getByText("No special type")).toBeInTheDocument();
    });
  });
});
