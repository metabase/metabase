import {
  metadata,
  SAMPLE_DATASET,
  ORDERS,
  PRODUCTS,
  PEOPLE,
} from "__support__/sample_dataset_fixture";

import Question from "metabase-lib/lib/Question";

describe("Mode", () => {
  const rawDataQuestion = ORDERS.question();
  const rawDataQuery = rawDataQuestion.query();

  describe("forQuestion(question)", () => {
    describe("with structured query question", () => {
      // testbed for generative testing? see http://leebyron.com/testcheck-js

      it("returns `segment` mode with raw data", () => {
        const mode = rawDataQuery.question().mode();
        expect(mode && mode.name()).toEqual("segment");
      });

      it("returns `metric` mode with >= 1 aggregations", () => {
        const mode = rawDataQuery
          .aggregate(["count"])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("metric");
      });

      it("returns `timeseries` mode with >=1 aggregations and date breakout", () => {
        const mode = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "datetime-field",
            ["field-id", ORDERS.CREATED_AT.id],
            "day",
          ])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("timeseries");
      });
      it("returns `timeseries` mode with >=1 aggregations and date + category breakout", () => {
        const mode = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "datetime-field",
            ["field-id", ORDERS.CREATED_AT.id],
            "day",
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS.PRODUCT_ID.id],
            ["field-id", PRODUCTS.CATEGORY.id],
          ])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("timeseries");
      });

      it("returns `geo` mode with >=1 aggregations and an address breakout", () => {
        const mode = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "fk->",
            ["field-id", ORDERS.USER_ID.id],
            ["field-id", PEOPLE.STATE.id],
          ])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("geo");
      });

      it("returns `pivot` mode with >=1 aggregations and 1-2 category breakouts", () => {
        const mode = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "fk->",
            ["field-id", ORDERS.PRODUCT_ID.id],
            ["field-id", PRODUCTS.CATEGORY.id],
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS.USER_ID.id],
            ["field-id", PEOPLE.STATE.id],
          ])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("pivot");
      });

      it("returns `object` mode with pk filter", () => {
        const mode = rawDataQuery
          .filter(["=", ["field-id", ORDERS.ID.id], 42])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("object");
      });

      it("returns `default` mode with >=0 aggregations and >=3 breakouts", () => {
        const mode = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "datetime-field",
            ["field-id", ORDERS.CREATED_AT.id],
            "day",
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS.PRODUCT_ID.id],
            ["field-id", PRODUCTS.CATEGORY.id],
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS.USER_ID.id],
            ["field-id", PEOPLE.STATE.id],
          ])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("default");
      });
      it("returns `default` mode with >=1 aggregations and >=1 breakouts when first neither date or category", () => {});
    });
    describe("with native query question", () => {
      it("returns `NativeMode` for empty query", () => {});
      it("returns `NativeMode` for query with query text", () => {});
    });
    describe("with oddly constructed query", () => {
      it("should throw an error", () => {
        // this is not the actual behavior atm (it returns DefaultMode)
      });
    });
  });

  describe("name()", () => {
    it("returns the correct name of current mode", () => {});
  });

  describe("actionsForClick()", () => {
    // this is action-specific so just rudimentary tests here showing that the actionsForClick logic works
    // Action-specific tests would optimally be in their respective test files
    describe("for a question with an aggregation and a time breakout", () => {
      const timeBreakoutQuestionMode = Question.create({
        databaseId: SAMPLE_DATASET.id,
        tableId: ORDERS.id,
        metadata,
      })
        .query()
        .aggregate(["count"])
        .breakout(["datetime-field", ["field-id", 1], "day"])
        .question()
        .setDisplay("table")
        .mode();

      it("has pivot as mode actions 1 and 2", () => {
        expect(timeBreakoutQuestionMode.actionsForClick()[0].name).toBe(
          "pivot-by-category",
        );
        expect(timeBreakoutQuestionMode.actionsForClick()[1].name).toBe(
          "pivot-by-location",
        );
      });
    });
  });
});
