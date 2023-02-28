import {
  metadata,
  SAMPLE_DATABASE,
  ORDERS,
  PRODUCTS,
  PEOPLE,
} from "__support__/sample_database_fixture";

import { getMode } from "metabase/modes/lib/modes";
import Question from "metabase-lib/Question";

describe("Mode", () => {
  const rawDataQuestion = ORDERS.question();
  const rawDataQuery = rawDataQuestion.query();

  describe("forQuestion(question)", () => {
    describe("with structured query question", () => {
      // testbed for generative testing? see http://leebyron.com/testcheck-js

      it("returns `segment` mode with raw data", () => {
        const question = rawDataQuery.question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("segment");
      });

      it("returns `metric` mode with >= 1 aggregations", () => {
        const question = rawDataQuery.aggregate(["count"]).question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("metric");
      });

      it("returns `timeseries` mode with >=1 aggregations and date breakout", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout(["field", ORDERS.CREATED_AT.id, { "temporal-unit": "day" }])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("timeseries");
      });
      it("returns `timeseries` mode with >=1 aggregations and date + category breakout", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout(["field", ORDERS.CREATED_AT.id, { "temporal-unit": "day" }])
          .breakout([
            "field",
            PRODUCTS.CATEGORY.id,
            { "source-field": ORDERS.PRODUCT_ID.id },
          ])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("timeseries");
      });

      it("returns `geo` mode with >=1 aggregations and an address breakout", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "field",
            PEOPLE.STATE.id,
            { "source-field": ORDERS.USER_ID.id },
          ])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("geo");
      });

      it("returns `pivot` mode with >=1 aggregations and 1-2 category breakouts", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "field",
            PRODUCTS.CATEGORY.id,
            { "source-field": ORDERS.PRODUCT_ID.id },
          ])
          .breakout([
            "field",
            PEOPLE.STATE.id,
            { "source-field": ORDERS.USER_ID.id },
          ])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("pivot");
      });

      it("returns `segment` mode with pk filter", () => {
        const question = rawDataQuery
          .filter(["=", ["field", ORDERS.ID.id, null], 42])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("segment");
      });

      it("returns `default` mode with >=0 aggregations and >=3 breakouts", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout(["field", ORDERS.CREATED_AT.id, { "temporal-unit": "day" }])
          .breakout([
            "field",
            PRODUCTS.CATEGORY.id,
            { "source-field": ORDERS.PRODUCT_ID.id },
          ])
          .breakout([
            "field",
            PEOPLE.STATE.id,
            { "source-field": ORDERS.USER_ID.id },
          ])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("default");
      });
    });
  });

  describe("actionsForClick()", () => {
    // this is action-specific so just rudimentary tests here showing that the actionsForClick logic works
    // Action-specific tests would optimally be in their respective test files
    describe("for a question with an aggregation and a time breakout", () => {
      const question = Question.create({
        databaseId: SAMPLE_DATABASE.id,
        tableId: ORDERS.id,
        metadata,
      })
        .query()
        .aggregate(["count"])
        .breakout(["field", 1, { "temporal-unit": "day" }])
        .question()
        .setDisplay("table");
      const mode = getMode(question);

      it("has pivot as mode actions 1 and 2", () => {
        expect(mode.actionsForClick()[0].name).toBe("pivot-by-category");
        expect(mode.actionsForClick()[1].name).toBe("pivot-by-location");
      });
    });
  });
});
