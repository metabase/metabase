import {
  metadata,
  ORDERS_PK_FIELD_ID,
  PRODUCT_CATEGORY_FIELD_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
  DATABASE_ID,
  ORDERS_TABLE_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  card,
  orders_raw_card,
  orders_count_card,
  orders_count_by_id_card,
  native_orders_count_card,
  invalid_orders_count_card,
} from "__support__/sample_dataset_fixture";

import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

describe("Question", () => {
  describe("CREATED WITH", () => {
    describe("new Question(metadata, alreadyDefinedCard)", () => {
      const question = new Question(metadata, orders_raw_card);
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
        databaseId: DATABASE_ID,
        tableId: ORDERS_TABLE_ID,
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
        const question = new Question(metadata, orders_raw_card);
        expect(question.canRun()).toBe(true);
      });
    });
    describe("canWrite()", () => {
      it("You should be able to write to a question you have permissions to", () => {
        const question = new Question(metadata, orders_raw_card);
        expect(question.canWrite()).toBe(true);
      });
      it("You should not be able to write to a question you dont  have permissions to", () => {
        const question = new Question(metadata, orders_count_by_id_card);
        expect(question.canWrite()).toBe(false);
      });
    });
    describe("isSaved()", () => {
      it("A newly created query doesn't have an id and shouldn't be marked as isSaved()", () => {
        const question = new Question(metadata, card);
        expect(question.isSaved()).toBe(false);
      });
      it("A saved question does have an id and should be marked as isSaved()", () => {
        const question = new Question(metadata, orders_raw_card);
        expect(question.isSaved()).toBe(true);
      });
    });
  });

  describe("CARD METHODS", () => {
    describe("card()", () => {
      it("A question wraps a query/card and you can see the underlying card with card()", () => {
        const question = new Question(metadata, orders_raw_card);
        expect(question.card()).toEqual(orders_raw_card);
      });
    });

    describe("setCard(card)", () => {
      it("changes the underlying card", () => {
        const question = new Question(metadata, orders_raw_card);
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
        const question = new Question(metadata, orders_raw_card);
        // This is a bit wack, and the repetitive naming is pretty confusing.
        const query = question.query();
        expect(query instanceof StructuredQuery).toBe(true);
      });
      it("returns a correct class instance for native query", () => {
        const question = new Question(metadata, native_orders_count_card);
        const query = question.query();
        expect(query instanceof NativeQuery).toBe(true);
      });
      it("throws an error for invalid queries", () => {
        const question = new Question(metadata, invalid_orders_count_card);
        expect(question.query).toThrow();
      });
    });
    describe("setQuery(query)", () => {
      it("updates the dataset_query of card", () => {
        const question = new Question(metadata, orders_raw_card);
        const rawQuery = new Question(
          metadata,
          native_orders_count_card,
        ).query();

        const newRawQuestion = question.setQuery(rawQuery);

        expect(newRawQuestion.query() instanceof NativeQuery).toBe(true);
      });
    });
    describe("setDatasetQuery(datasetQuery)", () => {
      it("updates the dataset_query of card", () => {
        const question = new Question(metadata, orders_raw_card);
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
        const question = new Question(metadata, orders_raw_card);
        const newQuestion = question.withoutNameAndId();

        expect(newQuestion.id()).toBeUndefined();
        expect(newQuestion.displayName()).toBeUndefined();
      });
      it("retains the dataset query", () => {
        const question = new Question(metadata, orders_raw_card);

        expect(question.id()).toBeDefined();
        expect(question.displayName()).toBeDefined();
      });
    });
  });

  describe("VISUALIZATION METHODS", () => {
    describe("display()", () => {
      it("returns the card's visualization type", () => {
        const question = new Question(metadata, orders_raw_card);
        // this forces a table view
        const tableQuestion = question.toUnderlyingData();
        // Not sure I'm a huge fan of magic strings here.
        expect(tableQuestion.display()).toBe("table");
      });
    });
    describe("setDisplay(display)", () => {
      it("sets the card's visualization type", () => {
        const question = new Question(metadata, orders_raw_card);
        // Not sure I'm a huge fan of magic strings here.
        const scalarQuestion = question.setDisplay("scalar");
        expect(scalarQuestion.display()).toBe("scalar");
      });
    });
  });

  // TODO: These are mode-dependent and should probably be tied to modes
  // At the same time, the choice that which actions are visible depend on the question's properties
  // as actions are filtered using those
  describe("METHODS FOR DRILL-THROUGH / ACTION WIDGET", () => {
    const rawDataQuestion = new Question(metadata, orders_raw_card);
    const timeBreakoutQuestion = Question.create({
      databaseId: DATABASE_ID,
      tableId: ORDERS_TABLE_ID,
      metadata,
    })
      .query()
      .addAggregation(["count"])
      .addBreakout(["datetime-field", ["field-id", 1], "day"])
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

    describe("summarize(...)", async () => {
      const question = new Question(metadata, orders_raw_card);
      it("returns the correct query for a summarization of a raw data table", () => {
        const summarizedQuestion = question.summarize(["count"]);
        expect(summarizedQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(summarizedQuestion._card.dataset_query).toEqual(
          orders_count_card.dataset_query,
        );
      });
    });

    describe("breakout(...)", async () => {
      it("works with a datetime field reference", () => {
        const ordersCountQuestion = new Question(metadata, orders_count_card);
        const brokenOutCard = ordersCountQuestion.breakout([
          "field-id",
          ORDERS_CREATED_DATE_FIELD_ID,
        ]);
        expect(brokenOutCard.canRun()).toBe(true);

        expect(brokenOutCard._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["count"]],
            breakout: [["field-id", ORDERS_CREATED_DATE_FIELD_ID]],
          },
        });

        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
        });
      });
      it("works with a primary key field reference", () => {
        const ordersCountQuestion = new Question(metadata, orders_count_card);
        const brokenOutCard = ordersCountQuestion.breakout([
          "field-id",
          ORDERS_PK_FIELD_ID,
        ]);
        expect(brokenOutCard.canRun()).toBe(true);
        // This breaks because we're apparently modifying OrdersCountDataCard
        expect(brokenOutCard._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["count"]],
            breakout: [["field-id", ORDERS_PK_FIELD_ID]],
          },
        });

        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
        });
      });
    });

    describe("pivot(...)", async () => {
      const ordersCountQuestion = new Question(metadata, orders_count_card);
      it("works with a datetime dimension ", () => {
        const pivotedCard = ordersCountQuestion.pivot([
          "field-id",
          ORDERS_CREATED_DATE_FIELD_ID,
        ]);
        expect(pivotedCard.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(pivotedCard._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["count"]],
            breakout: ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
          },
        });
        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
        });
      });
      it("works with PK dimension", () => {
        const pivotedCard = ordersCountQuestion.pivot([
          "field-id",
          ORDERS_PK_FIELD_ID,
        ]);
        expect(pivotedCard.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(pivotedCard._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            aggregation: [["count"]],
            breakout: ["field-id", ORDERS_PK_FIELD_ID],
          },
        });
        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
        });
      });
    });

    describe("filter(...)", async () => {
      const questionForFiltering = new Question(metadata, orders_raw_card);

      it("works with an id filter", () => {
        const filteringQuestion = questionForFiltering.filter(
          "=",
          { id: ORDERS_PK_FIELD_ID },
          1,
        );

        expect(filteringQuestion._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            filter: ["=", ["field-id", ORDERS_PK_FIELD_ID], 1],
          },
        });
      });
      it("works with a categorical value filter", () => {
        const filteringQuestion = questionForFiltering.filter(
          "=",
          {
            id: PRODUCT_CATEGORY_FIELD_ID,
            fk_field_id: ORDERS_PRODUCT_FK_FIELD_ID,
          },
          "Doohickey",
        );

        expect(filteringQuestion._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            filter: [
              "=",
              ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_CATEGORY_FIELD_ID],
              "Doohickey",
            ],
          },
        });
      });

      it("works with a time filter", () => {
        const filteringQuestion = questionForFiltering.filter(
          "=",
          { id: ORDERS_CREATED_DATE_FIELD_ID },
          "12/12/2012",
        );

        expect(filteringQuestion._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            filter: [
              "=",
              ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
              "12/12/2012",
            ],
          },
        });
      });
    });

    describe("drillUnderlyingRecords(...)", async () => {
      const ordersCountQuestion = new Question(
        metadata,
        orders_count_by_id_card,
      );

      // ???
      it("applies a filter to a given filterspec", () => {
        const dimensions = [
          { value: 1, column: metadata.fields[ORDERS_PK_FIELD_ID] },
        ];

        const drilledQuestion = ordersCountQuestion.drillUnderlyingRecords(
          dimensions,
        );
        expect(drilledQuestion.canRun()).toBe(true);

        expect(drilledQuestion._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            filter: ["=", ["field-id", ORDERS_PK_FIELD_ID], 1],
          },
        });
      });
    });

    describe("toUnderlyingRecords(...)", async () => {
      const question = new Question(metadata, orders_raw_card);
      const ordersCountQuestion = new Question(metadata, orders_count_card);

      it("returns underlying records correctly for a raw data query", () => {
        const underlyingRecordsQuestion = question.toUnderlyingRecords();

        expect(underlyingRecordsQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(underlyingRecordsQuestion._card.dataset_query).toEqual(
          orders_raw_card.dataset_query,
        );

        // Make sure we haven't mutated the underlying query
        expect(orders_raw_card.dataset_query.query).toEqual({
          "source-table": ORDERS_TABLE_ID,
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
          "source-table": ORDERS_TABLE_ID,
        });
      });
    });

    describe("toUnderlyingData()", async () => {
      const ordersCountQuestion = new Question(metadata, orders_count_card);

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
      const question = new Question(metadata, orders_raw_card);
      it("returns the correct query for a PK detail drill-through", () => {
        const drilledQuestion = question.drillPK(
          metadata.fields[ORDERS_PK_FIELD_ID],
          1,
        );

        expect(drilledQuestion.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(drilledQuestion._card.dataset_query).toEqual({
          type: "query",
          database: DATABASE_ID,
          query: {
            "source-table": ORDERS_TABLE_ID,
            filter: ["=", ["field-id", ORDERS_PK_FIELD_ID], 1],
          },
        });
      });
    });
  });

  describe("QUESTION EXECUTION", () => {
    describe("getResults()", () => {
      it("executes correctly a native query with field filter parameters", () => {
        pending();
        // test also here a combo of parameter with a value + parameter without a value + parameter with a default value
      });
    });
  });

  describe("COMPARISON TO OTHER QUESTIONS", () => {
    describe("isDirtyComparedTo(question)", () => {
      it("New questions are automatically dirty", () => {
        const question = new Question(metadata, orders_raw_card);
        const newQuestion = question.withoutNameAndId();
        expect(newQuestion.isDirtyComparedTo(question)).toBe(true);
      });
      it("Changing vis settings makes something dirty", () => {
        const question = new Question(metadata, orders_count_card);
        const underlyingDataQuestion = question.toUnderlyingRecords();
        expect(underlyingDataQuestion.isDirtyComparedTo(question)).toBe(true);
      });
    });
  });

  describe("URLs", () => {
    // Covered a lot in query_builder/actions.spec.js, just very basic cases here
    // (currently getUrl has logic that is strongly tied to the logic query builder Redux actions)
    describe("getUrl(originalQuestion?)", () => {
      it("returns a question with hash for an unsaved question", () => {
        const question = new Question(metadata, orders_raw_card);
        expect(question.getUrl()).toBe(
          "/question#eyJuYW1lIjoiUmF3IG9yZGVycyBkYXRhIiwiZGF0YXNldF9xdWVyeSI6eyJ0eXBlIjoicXVlcnkiLCJkYXRhYmFzZSI6MSwicXVlcnkiOnsic291cmNlLXRhYmxlIjoxfX0sImRpc3BsYXkiOiJ0YWJsZSIsInZpc3VhbGl6YXRpb25fc2V0dGluZ3MiOnt9fQ==",
        );
      });
    });
  });
});
