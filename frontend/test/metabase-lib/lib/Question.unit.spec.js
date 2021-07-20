import {
  metadata,
  SAMPLE_DATASET,
  ORDERS,
  PRODUCTS,
} from "__support__/sample_dataset_fixture";

import { assoc, dissoc } from "icepick";

import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

const card = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": ORDERS.id,
    },
  },
};

const orders_raw_card = {
  id: 1,
  name: "Raw orders data",
  display: "table",
  visualization_settings: {},
  can_write: true,
  dataset_query: {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": ORDERS.id,
    },
  },
};

const orders_count_card = {
  id: 2,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": ORDERS.id,
      aggregation: [["count"]],
    },
  },
};

const native_orders_count_card = {
  id: 3,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "native",
    database: SAMPLE_DATASET.id,
    native: {
      query: "SELECT count(*) FROM orders",
    },
  },
};

const invalid_orders_count_card = {
  id: 2,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "nosuchqueryprocessor",
    database: SAMPLE_DATASET.id,
    query: {
      query: "SELECT count(*) FROM orders",
    },
  },
};

const orders_count_by_id_card = {
  id: 2,
  name: "# orders data",
  can_write: false,
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": ORDERS.id,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.ID.id, null]],
    },
  },
};

describe("Question", () => {
  describe("CREATED WITH", () => {
    describe("new Question(alreadyDefinedCard, metadata)", () => {
      const question = new Question(orders_raw_card, metadata);
      it("isn't empty", () => {
        expect(question.isEmpty()).toBe(false);
      });
      it("has an id", () => {
        expect(question.id()).toBe(orders_raw_card.id);
      });
      it("has a name", () => {
        expect(question.displayName()).toBe(orders_raw_card.name);
      });
      it("is runnable", () => {
        expect(question.canRun()).toBe(true);
      });
      it("has correct display settings", () => {
        expect(question.display()).toBe("table");
      });
      it("has correct mode", () => {
        expect(question.mode().name()).toBe("segment");
      });
    });

    describe("Question.create(...)", () => {
      const question = Question.create({
        metadata,
        databaseId: SAMPLE_DATASET.id,
        tableId: ORDERS.id,
      });

      it("contains an empty structured query", () => {
        expect(question.query().constructor).toBe(StructuredQuery);
        expect(question.query().constructor).toBe(StructuredQuery);
      });

      it("defaults to table display", () => {
        expect(question.display()).toEqual("table");
      });
    });
  });

  describe("STATUS METHODS", () => {
    describe("canRun()", () => {
      it("You should be able to run a newly created query", () => {
        const question = new Question(orders_raw_card, metadata);
        expect(question.canRun()).toBe(true);
      });
    });
    describe("canWrite()", () => {
      it("You should be able to write to a question you have permissions to", () => {
        const question = new Question(orders_raw_card, metadata);
        expect(question.canWrite()).toBe(true);
      });
      it("You should not be able to write to a question you dont  have permissions to", () => {
        const question = new Question(orders_count_by_id_card, metadata);
        expect(question.canWrite()).toBe(false);
      });
    });
    describe("isSaved()", () => {
      it("A newly created query doesn't have an id and shouldn't be marked as isSaved()", () => {
        const question = new Question(card, metadata);
        expect(question.isSaved()).toBe(false);
      });
      it("A saved question does have an id and should be marked as isSaved()", () => {
        const question = new Question(orders_raw_card, metadata);
        expect(question.isSaved()).toBe(true);
      });
    });
  });

  describe("CARD METHODS", () => {
    describe("card()", () => {
      it("A question wraps a query/card and you can see the underlying card with card()", () => {
        const question = new Question(orders_raw_card, metadata);
        expect(question.card()).toEqual(orders_raw_card);
      });
    });

    describe("setCard(card)", () => {
      it("changes the underlying card", () => {
        const question = new Question(orders_raw_card, metadata);
        expect(question.card()).toEqual(orders_raw_card);
        const newQustion = question.setCard(orders_count_by_id_card);
        expect(question.card()).toEqual(orders_raw_card);
        expect(newQustion.card()).toEqual(orders_count_by_id_card);
      });
    });
  });

  describe("At the heart of a question is an MBQL query.", () => {
    describe("query()", () => {
      it("returns a correct class instance for structured query", () => {
        const question = new Question(orders_raw_card, metadata);
        // This is a bit wack, and the repetitive naming is pretty confusing.
        const query = question.query();
        expect(query instanceof StructuredQuery).toBe(true);
      });
      it("returns a correct class instance for native query", () => {
        const question = new Question(native_orders_count_card, metadata);
        const query = question.query();
        expect(query instanceof NativeQuery).toBe(true);
      });
      it("throws an error for invalid queries", () => {
        const question = new Question(invalid_orders_count_card, metadata);
        expect(question.query).toThrow();
      });
    });
    describe("setQuery(query)", () => {
      it("updates the dataset_query of card", () => {
        const question = new Question(orders_raw_card, metadata);
        const rawQuery = new Question(
          native_orders_count_card,
          metadata,
        ).query();

        const newRawQuestion = question.setQuery(rawQuery);

        expect(newRawQuestion.query() instanceof NativeQuery).toBe(true);
      });
    });
    describe("setDatasetQuery(datasetQuery)", () => {
      it("updates the dataset_query of card", () => {
        const question = new Question(orders_raw_card, metadata);
        const rawQuestion = question.setDatasetQuery(
          native_orders_count_card.dataset_query,
        );

        expect(rawQuestion.query() instanceof NativeQuery).toBe(true);
      });
    });
  });

  describe("RESETTING METHODS", () => {
    describe("withoutNameAndId()", () => {
      it("unsets the name and id", () => {
        const question = new Question(orders_raw_card, metadata);
        const newQuestion = question.withoutNameAndId();

        expect(newQuestion.id()).toBeUndefined();
        expect(newQuestion.displayName()).toBeUndefined();
      });
      it("retains the dataset query", () => {
        const question = new Question(orders_raw_card, metadata);

        expect(question.id()).toBeDefined();
        expect(question.displayName()).toBeDefined();
      });
    });
  });

  describe("VISUALIZATION METHODS", () => {
    describe("display()", () => {
      it("returns the card's visualization type", () => {
        const question = new Question(orders_raw_card, metadata);
        // this forces a table view
        const tableQuestion = question.toUnderlyingData();
        // Not sure I'm a huge fan of magic strings here.
        expect(tableQuestion.display()).toBe("table");
      });
    });
    describe("setDisplay(display)", () => {
      it("sets the card's visualization type", () => {
        const question = new Question(orders_raw_card, metadata);
        // Not sure I'm a huge fan of magic strings here.
        const scalarQuestion = question.setDisplay("scalar");
        expect(scalarQuestion.display()).toBe("scalar");
      });
    });
    describe("setDefaultDisplay", () => {
      it("sets display to 'scalar' for order count", () => {
        const question = new Question(
          orders_count_card,
          metadata,
        ).setDefaultDisplay();

        expect(question.display()).toBe("scalar");
      });

      it("should not set the display to scalar table was selected", () => {
        const question = new Question(orders_count_card, metadata)
          .setDisplay("table")
          .lockDisplay()
          .maybeUnlockDisplay(["table", "scalar"])
          .setDefaultDisplay();

        expect(question.display()).toBe("table");
      });

      it("should set the display to scalar if funnel was selected", () => {
        const question = new Question(orders_count_card, metadata)
          .setDisplay("funnel")
          .lockDisplay()
          .maybeUnlockDisplay(["table", "scalar"])
          .setDefaultDisplay();

        expect(question.display()).toBe("scalar");
      });
    });
  });

  // TODO: These are mode-dependent and should probably be tied to modes
  // At the same time, the choice that which actions are visible depend on the question's properties
  // as actions are filtered using those
  describe("METHODS FOR DRILL-THROUGH / ACTION WIDGET", () => {
    const rawDataQuestion = new Question(orders_raw_card, metadata);
    const timeBreakoutQuestion = Question.create({
      databaseId: SAMPLE_DATASET.id,
      tableId: ORDERS.id,
      metadata,
    })
      .query()
      .aggregate(["count"])
      .breakout(["field", 1, { "temporal-unit": "day" }])
      .question()
      .setDisplay("table");

    describe("mode()", () => {
      describe("for a new question with Orders table and Raw data aggregation", () => {
        it("returns the correct mode", () => {
          expect(rawDataQuestion.mode().name()).toBe("segment");
        });
      });
      describe("for a question with an aggregation and a time breakout", () => {
        it("returns the correct mode", () => {
          expect(timeBreakoutQuestion.mode().name()).toBe("timeseries");
        });
      });
    });

    describe("aggregate(...)", async () => {
      const question = new Question(orders_raw_card, metadata);
      it("returns the correct query for a summarization of a raw data table", () => {
        const summarizedQuestion = question.aggregate(["count"]);
        expect(summarizedQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(summarizedQuestion._card.dataset_query).toEqual(
          orders_count_card.dataset_query,
        );
      });
    });

    describe("breakout(...)", async () => {
      it("works with a datetime field reference", () => {
        const ordersCountQuestion = new Question(orders_count_card, metadata);
        const brokenOutCard = ordersCountQuestion.breakout([
          "field",
          ORDERS.CREATED_AT.id,
          null,
        ]);
        expect(brokenOutCard.canRun()).toBe(true);

        expect(brokenOutCard._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.CREATED_AT.id, null]],
          },
        });

        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });
      });
      it("works with a primary key field reference", () => {
        const ordersCountQuestion = new Question(orders_count_card, metadata);
        const brokenOutCard = ordersCountQuestion.breakout([
          "field",
          ORDERS.ID.id,
          null,
        ]);
        expect(brokenOutCard.canRun()).toBe(true);
        // This breaks because we're apparently modifying OrdersCountDataCard
        expect(brokenOutCard._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.ID.id, null]],
          },
        });

        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });
      });
    });

    describe("pivot(...)", async () => {
      const ordersCountQuestion = new Question(orders_count_card, metadata);
      it("works with a datetime dimension ", () => {
        const pivoted = ordersCountQuestion.pivot([
          ["field", ORDERS.CREATED_AT.id, null],
        ]);
        expect(pivoted.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(pivoted._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.CREATED_AT.id, null]],
          },
        });
        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });
      });
      it("works with PK dimension", () => {
        const pivoted = ordersCountQuestion.pivot([
          ["field", ORDERS.ID.id, null],
        ]);
        expect(pivoted.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(pivoted._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.ID.id, null]],
          },
        });
        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          aggregation: [["count"]],
        });
      });
    });

    describe("filter(...)", async () => {
      const questionForFiltering = new Question(orders_raw_card, metadata);

      it("works with an id filter", () => {
        const filteringQuestion = questionForFiltering.filter(
          "=",
          ORDERS.ID.column(),
          1,
        );

        expect(filteringQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            filter: ["=", ["field", ORDERS.ID.id, null], 1],
          },
        });
      });
      it("works with a categorical value filter", () => {
        const filteringQuestion = questionForFiltering.filter(
          "=",
          ORDERS.PRODUCT_ID.foreign(PRODUCTS.CATEGORY).column(),
          "Doohickey",
        );

        expect(filteringQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            filter: [
              "=",
              [
                "field",
                PRODUCTS.CATEGORY.id,
                { "source-field": ORDERS.PRODUCT_ID.id },
              ],
              "Doohickey",
            ],
          },
        });
      });

      it("works with a time filter", () => {
        const filteringQuestion = questionForFiltering.filter(
          "=",
          ORDERS.CREATED_AT.column(),
          "12/12/2012",
        );

        expect(filteringQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            filter: ["=", ["field", ORDERS.CREATED_AT.id, null], "12/12/2012"],
          },
        });
      });
    });

    describe("drillUnderlyingRecords(...)", async () => {
      const ordersCountQuestion = new Question(
        orders_count_by_id_card,
        metadata,
      );

      // ???
      it("applies a filter to a given filterspec", () => {
        const dimensions = [{ value: 1, column: ORDERS.ID.column() }];

        const drilledQuestion = ordersCountQuestion.drillUnderlyingRecords(
          dimensions,
        );
        expect(drilledQuestion.canRun()).toBe(true);

        expect(drilledQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            filter: ["=", ["field", ORDERS.ID.id, null], 1],
          },
        });
      });
    });

    describe("toUnderlyingRecords(...)", async () => {
      const question = new Question(orders_raw_card, metadata);
      const ordersCountQuestion = new Question(orders_count_card, metadata);

      it("returns underlying records correctly for a raw data query", () => {
        const underlyingRecordsQuestion = question.toUnderlyingRecords();

        expect(underlyingRecordsQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(underlyingRecordsQuestion._card.dataset_query).toEqual(
          orders_raw_card.dataset_query,
        );

        // Make sure we haven't mutated the underlying query
        expect(orders_raw_card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
        });
      });
      it("returns underlying records correctly for a broken out query", () => {
        const underlyingRecordsQuestion = ordersCountQuestion.toUnderlyingRecords();

        expect(underlyingRecordsQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(underlyingRecordsQuestion._card.dataset_query).toEqual(
          orders_raw_card.dataset_query,
        );

        // Make sure we haven't mutated the underlying query
        expect(orders_raw_card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
        });
      });
    });

    describe("toUnderlyingData()", async () => {
      const ordersCountQuestion = new Question(orders_count_card, metadata);

      it("returns underlying data correctly for table query", () => {
        const underlyingDataQuestion = ordersCountQuestion
          .setDisplay("table")
          .toUnderlyingData();

        expect(underlyingDataQuestion.display()).toBe("table");
      });
      it("returns underlying data correctly for line chart", () => {
        const underlyingDataQuestion = ordersCountQuestion
          .setDisplay("line")
          .toUnderlyingData();

        expect(underlyingDataQuestion.display()).toBe("table");
      });
    });

    describe("drillPK(...)", async () => {
      const question = new Question(orders_raw_card, metadata);
      it("returns the correct query for a PK detail drill-through", () => {
        const drilledQuestion = question.drillPK(ORDERS.ID, 1);

        expect(drilledQuestion.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(drilledQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            filter: ["=", ["field", ORDERS.ID.id, null], 1],
          },
        });
      });
    });
  });

  describe("COMPARISON TO OTHER QUESTIONS", () => {
    describe("isDirtyComparedTo(question)", () => {
      it("New questions are automatically dirty", () => {
        const question = new Question(orders_raw_card, metadata);
        const newQuestion = question.withoutNameAndId();
        expect(newQuestion.isDirtyComparedTo(question)).toBe(true);
      });
      it("Changing vis settings makes something dirty", () => {
        const question = new Question(orders_count_card, metadata);
        const underlyingDataQuestion = question.toUnderlyingRecords();
        expect(underlyingDataQuestion.isDirtyComparedTo(question)).toBe(true);
      });
    });
  });

  describe("URLs", () => {
    // Covered a lot in query_builder/actions.spec.js, just very basic cases here
    // (currently getUrl has logic that is strongly tied to the logic query builder Redux actions)
    describe("getUrl(originalQuestion?)", () => {
      it("returns URL with ID for saved question", () => {
        const question = new Question(
          assoc(orders_raw_card, "id", 1),
          metadata,
        );
        expect(question.getUrl()).toBe("/question/1-raw-orders-data");
      });
      it("returns a URL with hash for an unsaved question", () => {
        const question = new Question(dissoc(orders_raw_card, "id"), metadata);
        expect(question.getUrl()).toBe(
          "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJxdWVyeSI6eyJzb3VyY2UtdGFibGUiOjF9LCJ0eXBlIjoicXVlcnkifSwiZGlzcGxheSI6InRhYmxlIiwibmFtZSI6IlJhdyBvcmRlcnMgZGF0YSIsInZpc3VhbGl6YXRpb25fc2V0dGluZ3MiOnt9fQ==",
        );
      });
    });
  });
});
