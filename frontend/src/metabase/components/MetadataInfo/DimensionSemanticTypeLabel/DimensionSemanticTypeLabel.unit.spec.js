import React from "react";
import { render, screen } from "@testing-library/react";

import { PRODUCTS, metadata } from "__support__/sample_database_fixture";
import DimensionSemanticTypeLabel from "./DimensionSemanticTypeLabel";
import Dimension from "metabase-lib/lib/Dimension";

function setup(dimension) {
  return render(<DimensionSemanticTypeLabel dimension={dimension} />);
}

describe("DimensionSemanticTypeLabel", () => {
  describe("given a dimension with a semantic type", () => {
    beforeEach(() => {
      const fieldDimension = Dimension.parseMBQL(
        ["field", PRODUCTS.CREATED_AT.id, null],
        metadata,
      );
      fieldDimension.field().semantic_type = "type/CreationDate";

      setup(fieldDimension);
    });

    it("should show an icon corresponding to the given semantic type", () => {
      expect(screen.queryByLabelText("calendar icon")).toBeInTheDocument();
    });

    it("it should display the name of the semantic type", () => {
      expect(screen.getByText("Creation date")).toBeInTheDocument();
    });
  });

  describe("given a dimension without a semantic type", () => {
    beforeEach(() => {
      const fieldDimension = Dimension.parseMBQL(
        ["field", PRODUCTS.CREATED_AT.id, null],
        metadata,
      );
      fieldDimension.field().semantic_type = null;

      setup(fieldDimension);
    });

    it("should show an ellipsis icon representing the lack of semantic type", () => {
      expect(screen.queryByLabelText("ellipsis icon")).toBeInTheDocument();
    });

    it("it should display the given dimension's display name", () => {
      expect(screen.getByText("No special type")).toBeInTheDocument();
    });
  });
});
