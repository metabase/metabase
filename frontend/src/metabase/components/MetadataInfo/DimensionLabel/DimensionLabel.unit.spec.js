import React from "react";
import { render, screen } from "@testing-library/react";

import {
  SAMPLE_DATASET,
  PRODUCTS,
  metadata,
} from "__support__/sample_dataset_fixture";
import DimensionLabel from "./DimensionLabel";
import Dimension from "metabase-lib/lib/Dimension";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

function setup(dimension) {
  return render(<DimensionLabel dimension={dimension} />);
}

describe("DimensionLabel", () => {
  describe("given a FieldDimension", () => {
    beforeEach(() => {
      const fieldDimension = Dimension.parseMBQL(
        ["field", PRODUCTS.CREATED_AT.id, null],
        metadata,
      );

      setup(fieldDimension);
    });

    it("should show an icon corresponding to the given dimension's underlying field type", () => {
      expect(screen.queryByLabelText("calendar icon")).toBeInTheDocument();
    });

    it("it should display the given dimension's display name", () => {
      expect(
        screen.getByText(PRODUCTS.CREATED_AT.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("given a AggregationDimension", () => {
    beforeEach(() => {
      const aggQuery = new StructuredQuery(PRODUCTS.question(), {
        type: "query",
        database: SAMPLE_DATASET.id,
        query: {
          "source-table": PRODUCTS.id,
          aggregation: ["sum", ["field", PRODUCTS.RATING.id, null]],
        },
      });
      const aggregationDimension = Dimension.parseMBQL(
        ["aggregation", 0],
        metadata,
        aggQuery,
      );

      setup(aggregationDimension);
    });

    it("should show an icon corresponding to the given dimension's underlying field type", () => {
      expect(screen.queryByLabelText("int icon")).toBeInTheDocument();
    });

    it("it should display the given dimension's display name", () => {
      expect(screen.getByText("Sum of Rating")).toBeInTheDocument();
    });
  });

  describe("given a ExpressionDimension", () => {
    beforeEach(() => {
      const expressionDimension = Dimension.parseMBQL(
        ["expression", "Hello World"],
        metadata,
      );

      setup(expressionDimension);
    });

    it("should show an icon corresponding to the given dimension's underlying field type", () => {
      expect(screen.queryByLabelText("string icon")).toBeInTheDocument();
    });

    it("it should display the given dimension's display name", () => {
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });
  });

  describe("given a TemplateTagDimension", () => {
    beforeEach(() => {
      const nativeQuery = new NativeQuery(PRODUCTS.question(), {
        database: SAMPLE_DATASET.id,
        type: "native",
        native: {
          query: "select * from PRODUCTS where CREATED_AT = {{date}}",
          "template-tags": {
            date: {
              id: "abc",
              name: "date",
              "display-name": "Date variable",
              type: "date",
            },
          },
        },
      });

      const templateTagDimension = Dimension.parseMBQL(
        ["template-tag", "date"],
        metadata,
        nativeQuery,
      );

      setup(templateTagDimension);
    });

    it("should show an icon corresponding to the given dimension's underlying field type", () => {
      expect(screen.queryByLabelText("calendar icon")).toBeInTheDocument();
    });

    it("it should display the given dimension's display name", () => {
      expect(screen.getByText("Date variable")).toBeInTheDocument();
    });
  });
});
