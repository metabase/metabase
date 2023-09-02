import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PEOPLE,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  getMode,
  getQueryMode,
} from "metabase/visualizations/click-actions/lib/modes";
import { checkNotNull } from "metabase/core/utils/types";
import type { Filter } from "metabase-types/api";
import { SegmentMode } from "metabase/visualizations/click-actions/modes/SegmentMode";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

describe("Mode", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const ordersTable = checkNotNull(metadata.table(ORDERS_ID));

  const rawDataQuestion = ordersTable.question();
  const rawDataQuery = rawDataQuestion.query() as StructuredQuery;

  describe("forQuestion(question)", () => {
    describe("with structured query question", () => {
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
          .breakout(["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("timeseries");
      });

      it("returns `timeseries` mode with >=1 aggregations and date + category breakout", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout(["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }])
          .breakout([
            "field",
            PRODUCTS.CATEGORY,
            { "source-field": ORDERS.PRODUCT_ID },
          ])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("timeseries");
      });

      it("returns `geo` mode with >=1 aggregations and an address breakout", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout(["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("geo");
      });

      it("returns `pivot` mode with >=1 aggregations and 1-2 category breakouts", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "field",
            PRODUCTS.CATEGORY,
            { "source-field": ORDERS.PRODUCT_ID },
          ])
          .breakout(["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("pivot");
      });

      it("returns `segment` mode with pk filter", () => {
        const question = rawDataQuery
          .filter(["=", ["field", ORDERS.ID, null], 42])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("segment");
      });

      it("returns `default` mode with >=0 aggregations and >=3 breakouts", () => {
        const question = rawDataQuery
          .aggregate(["count"])
          .breakout(["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }])
          .breakout([
            "field",
            PRODUCTS.CATEGORY,
            { "source-field": ORDERS.PRODUCT_ID },
          ])
          .breakout(["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }])
          .question();
        const mode = getMode(question);
        expect(mode && mode.name()).toEqual("default");
      });
    });
  });

  describe("getQueryMode", () => {
    it("should be in segment mode when selecting one PK ID", () => {
      const filter: Filter = ["=", ["field", ORDERS.ID, null], 42];
      const query = ordersTable.query().filter(filter);
      const question = ordersTable.question().setQuery(query);
      expect(getQueryMode(question)).toBe(SegmentMode);
    });
  });

  describe("actionsForClick()", () => {
    // this is action-specific so just rudimentary tests here showing that the actionsForClick logic works
    // Action-specific tests would optimally be in their respective test files
    describe("for a question with an aggregation and a time breakout", () => {
      const question = (
        Question.create({
          databaseId: SAMPLE_DB_ID,
          tableId: ORDERS_ID,
          metadata,
        }).query() as StructuredQuery
      )
        .aggregate(["count"])
        .breakout(["field", 1, { "temporal-unit": "day" }])
        .question()
        .setDisplay("table");
      const mode = getMode(question);

      it("has pivot as mode actions 1 and 2", () => {
        const actions = mode?.actionsForClick(undefined, {});

        expect(actions?.[0].name).toBe("breakout-by");
      });
    });
  });
});
