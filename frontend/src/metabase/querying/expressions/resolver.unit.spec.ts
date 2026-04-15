import * as Lib from "metabase-lib";

import { columnsForExpressionMode } from "./mode";
import { resolver as makeResolver } from "./resolver";
import {
  expressions,
  fields,
  findDimensions,
  findField,
  measures,
  metrics,
  query,
  queryWithAggregation,
  segments,
  stageIndex,
} from "./test/shared";

describe("resolver", () => {
  describe.each(["expression", "filter"] as const)(
    "expressionMode = %s",
    (expressionMode) => {
      const resolve = makeResolver({
        query,
        stageIndex,
        expressionMode,
        availableColumns: Lib.expressionableColumns(query, stageIndex),
      });

      describe("type = boolean", () => {
        const boolean = (name: string) => resolve("boolean", name);

        it("should resolve segments", () => {
          expect(boolean("Expensive Things")).toEqual(
            segments.EXPENSIVE_THINGS,
          );
          expect(boolean("expensive things")).toEqual(
            segments.EXPENSIVE_THINGS,
          );
        });

        it("should resolve columns of type: boolean", () => {
          expect(boolean("bool")).toEqual(expressions.BOOL);
          expect(boolean("Bool")).toEqual(expressions.BOOL);
        });

        it("should not resolve unknown segments", () => {
          expect(() => boolean("Unknown")).toThrow(
            "Unknown Segment or boolean column: Unknown",
          );
        });

        it("should not resolve fields with non-boolean types", () => {
          expect(() => boolean("stringly")).toThrow(
            "Unknown Segment or boolean column: stringly",
          );
          expect(() => boolean("Total")).toThrow(
            "Unknown Segment or boolean column: Total",
          );
        });

        it("should not resolve metrics", () => {
          expect(() => boolean("Foo Metric")).toThrow(
            "Unknown Segment or boolean column: Foo Metric",
          );
        });

        it("should not resolve measures", () => {
          expect(() => boolean("Bar Measure")).toThrow(
            "Unknown Segment or boolean column: Bar Measure",
          );
        });
      });

      describe("type = string", () => {
        const string = (name: string) => resolve("string", name);

        it("should resolve dimensions of type: string", () => {
          expect(string("Product → Category")).toEqual(
            fields.products.CATEGORY,
          );
          expect(string("product → Category")).toEqual(
            fields.products.CATEGORY,
          );
          expect(string("User → Address")).toEqual(fields.people.ADDRESS);
          expect(string("User → address")).toEqual(fields.people.ADDRESS);
          expect(string("User.Address")).toEqual(fields.people.ADDRESS);
          expect(string("User.address")).toEqual(fields.people.ADDRESS);
          expect(string("stringly")).toEqual(expressions.STRINGLY);
          expect(string("Stringly")).toEqual(expressions.STRINGLY);
        });

        it("should resolve dimensions of types that can be stringly typed", () => {
          expect(string("Total")).toEqual(fields.orders.TOTAL);
          expect(string("total")).toEqual(fields.orders.TOTAL);
          expect(string("Product → Price")).toEqual(fields.products.PRICE);
        });

        it("should not resolve unknown fields", () => {
          expect(() => string("Unknown")).toThrow("Unknown column: Unknown");
        });

        it("should not resolve segments", () => {
          expect(() => string("Expensive Things")).toThrow(
            "Unknown column: Expensive Things",
          );
        });

        it("should not resolve metrics", () => {
          expect(() => string("Foo Metric")).toThrow(
            "Unknown column: Foo Metric",
          );
        });

        it("should not resolve measures", () => {
          expect(() => string("Bar Measure")).toThrow(
            "Unknown column: Bar Measure",
          );
        });
      });

      describe("type = number", () => {
        const number = (name: string) => resolve("number", name);

        it("should resolve dimensions of type: number", () => {
          expect(number("ID")).toEqual(fields.orders.ID);
          expect(number("id")).toEqual(fields.orders.ID);
          expect(number("Total")).toEqual(fields.orders.TOTAL);
          expect(number("total")).toEqual(fields.orders.TOTAL);
          expect(number("Product → Price")).toEqual(fields.products.PRICE);
          expect(number("Product.Price")).toEqual(fields.products.PRICE);
          expect(number("foo")).toEqual(expressions.FOO);
          expect(number("Foo")).toEqual(expressions.FOO);
        });

        it("should not resolve unknown fields", () => {
          expect(() => number("Unknown")).toThrow("Unknown column: Unknown");
        });

        it("should not resolve segments", () => {
          expect(() => number("Expensive Things")).toThrow(
            "Unknown column: Expensive Things",
          );
        });

        it("should not resolve metrics", () => {
          expect(() => number("Foo Metric")).toThrow(
            "Unknown column: Foo Metric",
          );
        });

        it("should not resolve measures", () => {
          expect(() => number("Bar Measure")).toThrow(
            "Unknown column: Bar Measure",
          );
        });
      });

      describe("type = datetime", () => {
        const datetime = (name: string) => resolve("datetime", name);

        it("should resolve dimensions of type: datetime", () => {
          expect(datetime("Created At")).toEqual(fields.orders.CREATED_AT);
        });

        it("should not resolve unknown fields", () => {
          expect(() => datetime("Unknown")).toThrow("Unknown column: Unknown");
        });

        it("should not resolve segments", () => {
          expect(() => datetime("Expensive Things")).toThrow(
            "Unknown column: Expensive Things",
          );
        });

        it("should not resolve metrics", () => {
          expect(() => datetime("Foo Metric")).toThrow(
            "Unknown column: Foo Metric",
          );
        });

        it("should resolve measures", () => {
          expect(() => datetime("Bar Measure")).toThrow(
            "Unknown column: Bar Measure",
          );
        });
      });

      describe("type = any", () => {
        const any = (name: string) => resolve("any", name);

        it("should resolve dimensions of type: any", () => {
          expect(any("Created At")).toEqual(fields.orders.CREATED_AT);
          expect(any("ID")).toEqual(fields.orders.ID);
          expect(any("Product → Price")).toEqual(fields.products.PRICE);
          expect(any("bool")).toEqual(expressions.BOOL);
        });

        it("should not resolve unknown fields", () => {
          expect(() => any("Unknown")).toThrow("Unknown column: Unknown");
        });

        it("should not resolve segments", () => {
          expect(() => any("Expensive Things")).toThrow(
            "Unknown column: Expensive Things",
          );
        });

        it("should not resolve metrics", () => {
          expect(() => any("Foo Metric")).toThrow("Unknown column: Foo Metric");
        });

        it("should not resolve measures", () => {
          expect(() => any("Bar Measure")).toThrow(
            "Unknown column: Bar Measure",
          );
        });
      });

      describe("type = expression", () => {
        const expression = (name: string) => resolve("expression", name);

        it("should resolve dimensions of type: expression", () => {
          expect(expression("Created At")).toEqual(fields.orders.CREATED_AT);
          expect(expression("ID")).toEqual(fields.orders.ID);
          expect(expression("Product → Price")).toEqual(fields.products.PRICE);
          expect(expression("bool")).toEqual(expressions.BOOL);
        });

        it("should not resolve unknown fields", () => {
          expect(() => expression("Unknown")).toThrow(
            "Unknown column: Unknown",
          );
        });

        it("should not resolve segments", () => {
          expect(() => expression("Expensive Things")).toThrow(
            "Unknown column: Expensive Things",
          );
        });

        it("should not resolve metrics", () => {
          expect(() => expression("Foo Metric")).toThrow(
            "Unknown column: Foo Metric",
          );
        });

        it("should not resolve measures", () => {
          expect(() => expression("Bar Measure")).toThrow(
            "Unknown column: Bar Measure",
          );
        });
      });

      describe("type = aggregation", () => {
        const aggregation = (name: string) => resolve("aggregation", name);

        it("should not resolve fields", () => {
          expect(() => aggregation("Unknown")).toThrow(
            "Unknown Aggregation, Measure or Metric: Unknown",
          );
          expect(() => aggregation("Created At")).toThrow(
            "No aggregation found in: Created At. Use functions like Sum() or custom Metrics",
          );
          expect(() => aggregation("Product → Price")).toThrow(
            "No aggregation found in: Product → Price. Use functions like Sum() or custom Metrics",
          );
          expect(() => aggregation("bool")).toThrow(
            "No aggregation found in: bool. Use functions like Sum() or custom Metrics",
          );
        });

        it("should not resolve unknown fields", () => {
          expect(() => aggregation("Unknown")).toThrow(
            "Unknown Aggregation, Measure or Metric: Unknown",
          );
        });

        it("should not resolve segments", () => {
          expect(() => aggregation("Expensive Things")).toThrow(
            "Unknown Aggregation, Measure or Metric: Expensive Things",
          );
        });

        it("should resolve metrics", () => {
          expect(aggregation("Foo Metric")).toEqual(metrics.FOO);
          expect(aggregation("foo metric")).toEqual(metrics.FOO);
        });

        it("should resolve measures", () => {
          expect(aggregation("Bar Measure")).toEqual(measures.BAR);
          expect(aggregation("bar measure")).toEqual(measures.BAR);
        });
      });

      it("should allow resolving field with exact case matches first", () => {
        expect(resolve("number", "BAR")).toEqual(expressions.BAR_UPPER);
        expect(resolve("number", "bar")).toEqual(expressions.BAR_LOWER);
      });

      describe("should never resolve aggregations", () => {
        const query = queryWithAggregation;

        const resolve = makeResolver({
          query,
          stageIndex,
          expressionMode,
          availableColumns: columnsForExpressionMode({
            query,
            stageIndex,
            expressionMode,
          }),
        });

        it.each(["number", "datetime", "string", "boolean"] as const)(
          "type = %s",
          (type) => {
            expect(() => resolve(type, "Bar Aggregation")).toThrow(
              type === "boolean"
                ? "Unknown Segment or boolean column: Bar Aggregation"
                : "Unknown column: Bar Aggregation",
            );
          },
        );
      });
    },
  );

  describe("expressionMode = aggregation", () => {
    const query = queryWithAggregation;
    const { fields, expressions, segments, metrics, aggregations } =
      findDimensions(query);

    const resolve = makeResolver({
      query,
      stageIndex,
      expressionMode: "aggregation",
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "aggregation",
      }),
    });

    describe("type = boolean", () => {
      const boolean = (name: string) => resolve("boolean", name);

      it("should resolve segments", () => {
        expect(boolean("Expensive Things")).toEqual(segments.EXPENSIVE_THINGS);
      });

      it("should resolve columns of type: boolean", () => {
        expect(boolean("bool")).toEqual(expressions.BOOL);
      });

      it("should not resolve unknown fields", () => {
        expect(() => boolean("Unknown")).toThrow(
          "Unknown Segment or boolean column: Unknown",
        );
      });

      it("should not resolve fields with non-boolean types", () => {
        expect(() => boolean("stringly")).toThrow(
          "Unknown Segment or boolean column: stringly",
        );
        expect(() => boolean("Total")).toThrow(
          "Unknown Segment or boolean column: Total",
        );
      });

      it("should not resolve metrics", () => {
        expect(() => boolean("Foo Metric")).toThrow(
          "Unknown Segment or boolean column: Foo Metric",
        );
      });

      it("should not resolve measures", () => {
        expect(() => boolean("Bar Measure")).toThrow(
          "Unknown Segment or boolean column: Bar Measure",
        );
      });

      it("should not resolve aggregations", () => {
        expect(() => boolean("Bar Aggregation")).toThrow(
          "Unknown Segment or boolean column: Bar Aggregation",
        );
      });
    });

    describe("type = string", () => {
      const string = (name: string) => resolve("string", name);

      it("should resolve dimensions of type: string", () => {
        expect(string("Product → Category")).toEqual(fields.products.CATEGORY);
        expect(string("User → Address")).toEqual(fields.people.ADDRESS);
        expect(string("User.Address")).toEqual(fields.people.ADDRESS);
        expect(string("stringly")).toEqual(expressions.STRINGLY);
      });

      it("should resolve dimensions of types that can be stringly typed", () => {
        expect(string("Total")).toEqual(fields.orders.TOTAL);
        expect(string("Product → Price")).toEqual(fields.products.PRICE);
      });

      it("should not resolve unknown fields", () => {
        expect(() => string("Unknown")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Unknown",
        );
      });

      it("should not resolve segments", () => {
        expect(() => string("Expensive Things")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Expensive Things",
        );
      });

      it("should resolve metrics", () => {
        expect(string("Foo Metric")).toEqual(metrics.FOO);
      });

      it("should resolve measures", () => {
        expect(string("Bar Measure")).toEqual(measures.BAR);
      });

      it("should resolve aggregations", () => {
        expect(string("Bar Aggregation")).toEqual(aggregations.BAR_AGGREGATION);
      });
    });

    describe("type = number", () => {
      const number = (name: string) => resolve("number", name);

      it("should resolve dimensions of type: number", () => {
        expect(number("ID")).toEqual(fields.orders.ID);
        expect(number("Total")).toEqual(fields.orders.TOTAL);
        expect(number("Product → Price")).toEqual(fields.products.PRICE);
        expect(number("Product.Price")).toEqual(fields.products.PRICE);
        expect(number("foo")).toEqual(expressions.FOO);
      });

      it("should not resolve unknown fields", () => {
        expect(() => number("Unknown")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Unknown",
        );
      });

      it("should not resolve segments", () => {
        expect(() => number("Expensive Things")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Expensive Things",
        );
      });

      it("should resolve metrics", () => {
        expect(number("Foo Metric")).toEqual(metrics.FOO);
      });

      it("should resolve measures", () => {
        expect(number("Bar Measure")).toEqual(measures.BAR);
      });

      it("should resolve aggregations", () => {
        expect(number("Bar Aggregation")).toEqual(aggregations.BAR_AGGREGATION);
      });
    });

    describe("type = datetime", () => {
      const datetime = (name: string) => resolve("datetime", name);

      it("should resolve dimensions of type: datetime", () => {
        expect(datetime("Created At")).toEqual(fields.orders.CREATED_AT);
      });

      it("should not resolve unknown fields", () => {
        expect(() => datetime("Unknown")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Unknown",
        );
      });

      it("should not resolve segments", () => {
        expect(() => datetime("Expensive Things")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Expensive Things",
        );
      });

      it("should resolve metrics", () => {
        expect(datetime("Foo Metric")).toEqual(metrics.FOO);
      });

      it("should resolve measures", () => {
        expect(datetime("Bar Measure")).toEqual(measures.BAR);
      });

      it("should resolve aggregations", () => {
        expect(datetime("Bar Aggregation")).toEqual(
          aggregations.BAR_AGGREGATION,
        );
      });
    });

    describe("type = any", () => {
      const any = (name: string) => resolve("any", name);

      it("should resolve dimensions of type: any", () => {
        expect(any("Created At")).toEqual(fields.orders.CREATED_AT);
        expect(any("ID")).toEqual(fields.orders.ID);
        expect(any("Product → Price")).toEqual(fields.products.PRICE);
        expect(any("bool")).toEqual(expressions.BOOL);
      });

      it("should not resolve unknown fields", () => {
        expect(() => any("Unknown")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Unknown",
        );
      });

      it("should not resolve segments", () => {
        // We do not resolve segments here since any is only used in offset
        // and offset only works in aggregations.
        expect(() => any("Expensive Things")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Expensive Things",
        );
      });

      it("should resolve metrics", () => {
        expect(any("Foo Metric")).toEqual(metrics.FOO);
      });

      it("should resolve measures", () => {
        expect(any("Bar Measure")).toEqual(measures.BAR);
      });

      it("should resolve aggregations", () => {
        expect(any("Bar Aggregation")).toEqual(aggregations.BAR_AGGREGATION);
      });
    });

    describe("type = expression", () => {
      const expression = (name: string) => resolve("expression", name);

      it("should resolve dimensions of type: expression", () => {
        expect(expression("Created At")).toEqual(fields.orders.CREATED_AT);
        expect(expression("ID")).toEqual(fields.orders.ID);
        expect(expression("Product → Price")).toEqual(fields.products.PRICE);
        expect(expression("bool")).toEqual(expressions.BOOL);
      });

      it("should not resolve unknown fields", () => {
        expect(() => expression("Unknown")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Unknown",
        );
      });

      it("should not resolve segments", () => {
        expect(() => expression("Expensive Things")).toThrow(
          "Unknown column, Aggregation, Measure or Metric: Expensive Things",
        );
      });

      it("should resolve metrics", () => {
        expect(expression("Foo Metric")).toEqual(metrics.FOO);
      });

      it("should resolve measures", () => {
        expect(expression("Bar Measure")).toEqual(measures.BAR);
      });

      it("should resolve aggregations", () => {
        expect(expression("Bar Aggregation")).toEqual(
          aggregations.BAR_AGGREGATION,
        );
      });
    });

    describe("type = aggregation", () => {
      const aggregation = (name: string) => resolve("aggregation", name);

      it("should not resolve fields", () => {
        expect(() => aggregation("Unknown")).toThrow(
          "Unknown Aggregation, Measure or Metric: Unknown",
        );
        expect(() => aggregation("Created At")).toThrow(
          "No aggregation found in: Created At. Use functions like Sum() or custom Metrics",
        );
        expect(() => aggregation("Product → Price")).toThrow(
          "No aggregation found in: Product → Price. Use functions like Sum() or custom Metrics",
        );
        expect(() => aggregation("bool")).toThrow(
          "No aggregation found in: bool. Use functions like Sum() or custom Metrics",
        );
      });

      it("should not resolve unknown fields", () => {
        expect(() => aggregation("Unknown")).toThrow(
          "Unknown Aggregation, Measure or Metric: Unknown",
        );
      });

      it("should not resolve segments", () => {
        expect(() => aggregation("Expensive Things")).toThrow(
          "Unknown Aggregation, Measure or Metric: Expensive Things",
        );
      });

      it("should resolve metrics", () => {
        expect(aggregation("Foo Metric")).toEqual(metrics.FOO);
      });

      it("should resolve measures", () => {
        expect(aggregation("Bar Measure")).toEqual(measures.BAR);
      });

      it("should resolve aggregations", () => {
        expect(aggregation("Bar Aggregation")).toEqual(
          aggregations.BAR_AGGREGATION,
        );
      });
    });

    it("should allow resolving field with exact case matches first", () => {
      expect(resolve("number", "BAR")).toEqual(expressions.BAR_UPPER);
      expect(resolve("number", "bar")).toEqual(expressions.BAR_LOWER);
    });
  });

  describe("query with aggregation in first stage > later stages", () => {
    const query = Lib.appendStage(queryWithAggregation);
    const aggregations = {
      BAR_AGGREGATION: findField(query, "Bar Aggregation"),
    };

    const resolve = makeResolver({
      query,
      stageIndex,
      expressionMode: "expression",
      availableColumns: columnsForExpressionMode({
        query,
        stageIndex,
        expressionMode: "expression",
      }),
    });

    describe("type = boolean", () => {
      const boolean = (name: string) => resolve("boolean", name);

      it("should not resolve non-boolean aggregations", () => {
        expect(() => boolean("Bar Aggregation")).toThrow(
          "Unknown Segment or boolean column: Bar Aggregation",
        );
      });
    });

    describe("type = string", () => {
      const string = (name: string) => resolve("string", name);

      it("should resolve aggregations", () => {
        expect(string("Bar Aggregation")).toEqual(aggregations.BAR_AGGREGATION);
      });
    });

    describe("type = number", () => {
      const number = (name: string) => resolve("number", name);

      it("should resolve aggregations", () => {
        expect(number("Bar Aggregation")).toEqual(aggregations.BAR_AGGREGATION);
      });
    });

    describe("type = datetime", () => {
      const datetime = (name: string) => resolve("datetime", name);

      it("should resolve aggregations", () => {
        expect(datetime("Bar Aggregation")).toEqual(
          aggregations.BAR_AGGREGATION,
        );
      });
    });

    describe("type = any", () => {
      const any = (name: string) => resolve("any", name);

      it("should resolve aggregations", () => {
        expect(any("Bar Aggregation")).toEqual(aggregations.BAR_AGGREGATION);
      });
    });

    describe("type = expression", () => {
      const expression = (name: string) => resolve("expression", name);

      it("should resolve aggregations", () => {
        expect(expression("Bar Aggregation")).toEqual(
          aggregations.BAR_AGGREGATION,
        );
      });
    });

    describe("type = aggregation", () => {
      const aggregation = (name: string) => resolve("aggregation", name);

      it("should not resolve aggregation as it is now just a field", () => {
        expect(() => aggregation("Bar Aggregation")).toThrow(
          "No aggregation found in: Bar Aggregation. Use functions like Sum() or custom Metrics",
        );
      });
    });
  });
});
