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
            `There's no true-or-false column or segment called "Unknown". Replace it with a check that's true or false, like [Total] > 100.`,
          );
        });

        it("should not resolve fields with non-boolean types", () => {
          expect(() => boolean("stringly")).toThrow(
            `There's no true-or-false column or segment called "stringly". Replace it with a check that's true or false, like [Total] > 100.`,
          );
          expect(() => boolean("Total")).toThrow(
            `There's no true-or-false column or segment called "Total". Replace it with a check that's true or false, like [Total] > 100.`,
          );
        });

        it("should not resolve metrics", () => {
          expect(() => boolean("Foo Metric")).toThrow(
            `There's no true-or-false column or segment called "Foo Metric". Replace it with a check that's true or false, like [Total] > 100.`,
          );
        });

        it("should not resolve measures", () => {
          expect(() => boolean("Bar Measure")).toThrow(
            `There's no true-or-false column or segment called "Bar Measure". Replace it with a check that's true or false, like [Total] > 100.`,
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
          expect(() => string("Unknown")).toThrow(
            `There's no column called "Unknown". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve segments", () => {
          expect(() => string("Expensive Things")).toThrow(
            `There's no column called "Expensive Things". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve metrics", () => {
          expect(() => string("Foo Metric")).toThrow(
            `There's no column called "Foo Metric". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve measures", () => {
          expect(() => string("Bar Measure")).toThrow(
            `There's no column called "Bar Measure". Check the spelling, or press [ to see the list of columns.`,
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
          expect(() => number("Unknown")).toThrow(
            `There's no column called "Unknown". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve segments", () => {
          expect(() => number("Expensive Things")).toThrow(
            `There's no column called "Expensive Things". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve metrics", () => {
          expect(() => number("Foo Metric")).toThrow(
            `There's no column called "Foo Metric". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve measures", () => {
          expect(() => number("Bar Measure")).toThrow(
            `There's no column called "Bar Measure". Check the spelling, or press [ to see the list of columns.`,
          );
        });
      });

      describe("type = datetime", () => {
        const datetime = (name: string) => resolve("datetime", name);

        it("should resolve dimensions of type: datetime", () => {
          expect(datetime("Created At")).toEqual(fields.orders.CREATED_AT);
        });

        it("should not resolve unknown fields", () => {
          expect(() => datetime("Unknown")).toThrow(
            `There's no column called "Unknown". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve segments", () => {
          expect(() => datetime("Expensive Things")).toThrow(
            `There's no column called "Expensive Things". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve metrics", () => {
          expect(() => datetime("Foo Metric")).toThrow(
            `There's no column called "Foo Metric". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should resolve measures", () => {
          expect(() => datetime("Bar Measure")).toThrow(
            `There's no column called "Bar Measure". Check the spelling, or press [ to see the list of columns.`,
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
            `There's no column called "Unknown". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve segments", () => {
          expect(() => any("Expensive Things")).toThrow(
            `There's no column called "Expensive Things". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve metrics", () => {
          expect(() => any("Foo Metric")).toThrow(
            `There's no column called "Foo Metric". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve measures", () => {
          expect(() => any("Bar Measure")).toThrow(
            `There's no column called "Bar Measure". Check the spelling, or press [ to see the list of columns.`,
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
            `There's no column called "Unknown". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve segments", () => {
          expect(() => expression("Expensive Things")).toThrow(
            `There's no column called "Expensive Things". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve metrics", () => {
          expect(() => expression("Foo Metric")).toThrow(
            `There's no column called "Foo Metric". Check the spelling, or press [ to see the list of columns.`,
          );
        });

        it("should not resolve measures", () => {
          expect(() => expression("Bar Measure")).toThrow(
            `There's no column called "Bar Measure". Check the spelling, or press [ to see the list of columns.`,
          );
        });
      });

      describe("type = aggregation", () => {
        const aggregation = (name: string) => resolve("aggregation", name);

        it("should not resolve fields", () => {
          expect(() => aggregation("Unknown")).toThrow(
            `There's no metric or measure called "Unknown". Check the spelling, or use a function like Sum([Total]).`,
          );
          expect(() => aggregation("Created At")).toThrow(
            `"Created At" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([Created At]) or Average([Created At]).`,
          );
          expect(() => aggregation("Product → Price")).toThrow(
            `"Product → Price" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([Product → Price]) or Average([Product → Price]).`,
          );
          expect(() => aggregation("bool")).toThrow(
            `"bool" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([bool]) or Average([bool]).`,
          );
        });

        it("should not resolve unknown fields", () => {
          expect(() => aggregation("Unknown")).toThrow(
            `There's no metric or measure called "Unknown". Check the spelling, or use a function like Sum([Total]).`,
          );
        });

        it("should not resolve segments", () => {
          expect(() => aggregation("Expensive Things")).toThrow(
            `There's no metric or measure called "Expensive Things". Check the spelling, or use a function like Sum([Total]).`,
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
                ? `There's no true-or-false column or segment called "Bar Aggregation". Replace it with a check that's true or false, like [Total] > 100.`
                : `There's no column called "Bar Aggregation". Check the spelling, or press [ to see the list of columns.`,
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
          `There's no true-or-false column or segment called "Unknown". Replace it with a check that's true or false, like [Total] > 100.`,
        );
      });

      it("should not resolve fields with non-boolean types", () => {
        expect(() => boolean("stringly")).toThrow(
          `There's no true-or-false column or segment called "stringly". Replace it with a check that's true or false, like [Total] > 100.`,
        );
        expect(() => boolean("Total")).toThrow(
          `There's no true-or-false column or segment called "Total". Replace it with a check that's true or false, like [Total] > 100.`,
        );
      });

      it("should not resolve metrics", () => {
        expect(() => boolean("Foo Metric")).toThrow(
          `There's no true-or-false column or segment called "Foo Metric". Replace it with a check that's true or false, like [Total] > 100.`,
        );
      });

      it("should not resolve measures", () => {
        expect(() => boolean("Bar Measure")).toThrow(
          `There's no true-or-false column or segment called "Bar Measure". Replace it with a check that's true or false, like [Total] > 100.`,
        );
      });

      it("should not resolve aggregations", () => {
        expect(() => boolean("Bar Aggregation")).toThrow(
          `There's no true-or-false column or segment called "Bar Aggregation". Replace it with a check that's true or false, like [Total] > 100.`,
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
          `There's no column, metric or measure called "Unknown". Check the spelling, or press [ to see the list.`,
        );
      });

      it("should not resolve segments", () => {
        expect(() => string("Expensive Things")).toThrow(
          `There's no column, metric or measure called "Expensive Things". Check the spelling, or press [ to see the list.`,
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
          `There's no column, metric or measure called "Unknown". Check the spelling, or press [ to see the list.`,
        );
      });

      it("should not resolve segments", () => {
        expect(() => number("Expensive Things")).toThrow(
          `There's no column, metric or measure called "Expensive Things". Check the spelling, or press [ to see the list.`,
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
          `There's no column, metric or measure called "Unknown". Check the spelling, or press [ to see the list.`,
        );
      });

      it("should not resolve segments", () => {
        expect(() => datetime("Expensive Things")).toThrow(
          `There's no column, metric or measure called "Expensive Things". Check the spelling, or press [ to see the list.`,
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
          `There's no column, metric or measure called "Unknown". Check the spelling, or press [ to see the list.`,
        );
      });

      it("should not resolve segments", () => {
        // We do not resolve segments here since any is only used in offset
        // and offset only works in aggregations.
        expect(() => any("Expensive Things")).toThrow(
          `There's no column, metric or measure called "Expensive Things". Check the spelling, or press [ to see the list.`,
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
          `There's no column, metric or measure called "Unknown". Check the spelling, or press [ to see the list.`,
        );
      });

      it("should not resolve segments", () => {
        expect(() => expression("Expensive Things")).toThrow(
          `There's no column, metric or measure called "Expensive Things". Check the spelling, or press [ to see the list.`,
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
          `There's no metric or measure called "Unknown". Check the spelling, or use a function like Sum([Total]).`,
        );
        expect(() => aggregation("Created At")).toThrow(
          `"Created At" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([Created At]) or Average([Created At]).`,
        );
        expect(() => aggregation("Product → Price")).toThrow(
          `"Product → Price" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([Product → Price]) or Average([Product → Price]).`,
        );
        expect(() => aggregation("bool")).toThrow(
          `"bool" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([bool]) or Average([bool]).`,
        );
      });

      it("should not resolve unknown fields", () => {
        expect(() => aggregation("Unknown")).toThrow(
          `There's no metric or measure called "Unknown". Check the spelling, or use a function like Sum([Total]).`,
        );
      });

      it("should not resolve segments", () => {
        expect(() => aggregation("Expensive Things")).toThrow(
          `There's no metric or measure called "Expensive Things". Check the spelling, or use a function like Sum([Total]).`,
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
          `There's no true-or-false column or segment called "Bar Aggregation". Replace it with a check that's true or false, like [Total] > 100.`,
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
          `"Bar Aggregation" is a column, so it can't be used as a summary on its own. Wrap it in a function like Sum([Bar Aggregation]) or Average([Bar Aggregation]).`,
        );
      });
    });
  });
});
