import {
  metadata,
  DATABASE_ID,
  ORDERS_TABLE_ID,
  ORDERS_PK_FIELD_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  ORDERS_USER_FK_FIELD_ID,
  PRODUCT_CATEGORY_FIELD_ID,
  PEOPLE_STATE_FIELD_ID,
  orders_raw_card,
} from "__support__/sample_dataset_fixture";

import Question from "metabase-lib/lib/Question";

describe("Mode", () => {
  const rawDataQuestion = new Question(metadata, orders_raw_card);
  const rawDataQuery = rawDataQuestion.query();
  const rawDataQuestionMode = rawDataQuestion.mode();

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
            ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
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
            ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
            "day",
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
            ["field-id", PRODUCT_CATEGORY_FIELD_ID],
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
            ["field-id", ORDERS_USER_FK_FIELD_ID],
            ["field-id", PEOPLE_STATE_FIELD_ID],
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
            ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
            ["field-id", PRODUCT_CATEGORY_FIELD_ID],
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS_USER_FK_FIELD_ID],
            ["field-id", PEOPLE_STATE_FIELD_ID],
          ])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("pivot");
      });

      it("returns `object` mode with pk filter", () => {
        const mode = rawDataQuery
          .filter(["=", ["field-id", ORDERS_PK_FIELD_ID], 42])
          .question()
          .mode();
        expect(mode && mode.name()).toEqual("object");
      });

      it("returns `default` mode with >=0 aggregations and >=3 breakouts", () => {
        const mode = rawDataQuery
          .aggregate(["count"])
          .breakout([
            "datetime-field",
            ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
            "day",
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
            ["field-id", PRODUCT_CATEGORY_FIELD_ID],
          ])
          .breakout([
            "fk->",
            ["field-id", ORDERS_USER_FK_FIELD_ID],
            ["field-id", PEOPLE_STATE_FIELD_ID],
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

  describe("actions()", () => {
    describe("for a new question with Orders table and Raw data aggregation", () => {
      pending();
      it("returns a correct number of mode actions", () => {
        expect(rawDataQuestionMode.actions().length).toBe(3);
      });
      it("returns a defined metric as mode action 1", () => {
        expect(rawDataQuestionMode.actions()[0].name).toBe("common-metric");
        // TODO: Sameer 6/16/17
        // This is wack and not really testable. We shouldn't be passing around react components in this imo
        // expect(question.actions()[1].title.props.children).toBe("Total Order Value");
      });
      it("returns a count timeseries as mode action 2", () => {
        expect(rawDataQuestionMode.actions()[1].name).toBe("count-by-time");
        expect(rawDataQuestionMode.actions()[1].icon).toBe("line");
        // TODO: Sameer 6/16/17
        // This is wack and not really testable. We shouldn't be passing around react components in this imo
        // expect(question.actions()[2].title.props.children).toBe("Count of rows by time");
      });
      it("returns summarize as mode action 3", () => {
        expect(rawDataQuestionMode.actions()[2].name).toBe("summarize");
        expect(rawDataQuestionMode.actions()[2].icon).toBe("sum");
        expect(rawDataQuestionMode.actions()[2].title).toBe(
          "Summarize this segment",
        );
      });
    });

    describe("for a question with an aggregation and a time breakout", () => {
      const timeBreakoutQuestionMode = Question.create({
        databaseId: DATABASE_ID,
        tableId: ORDERS_TABLE_ID,
        metadata,
      })
        .query()
        .aggregate(["count"])
        .breakout(["datetime-field", ["field-id", 1], "day"])
        .question()
        .setDisplay("table")
        .mode();

      it("has pivot as mode actions 1 and 2", () => {
        expect(timeBreakoutQuestionMode.actions()[0].name).toBe(
          "pivot-by-category",
        );
        expect(timeBreakoutQuestionMode.actions()[1].name).toBe(
          "pivot-by-location",
        );
      });

      describe("with xrays enabled", () => {
        it("has the correct number of items", () => {
          expect(timeBreakoutQuestionMode.actions().length).toBe(4);
        });
      });
    });
  });

  describe("actionsForClick()", () => {
    // this is action-specific so just rudimentary tests here showing that the actionsForClick logic works
    // Action-specific tests would optimally be in their respective test files
  });
});
