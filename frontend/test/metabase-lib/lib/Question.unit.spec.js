import { assoc, dissoc, assocIn } from "icepick";
import { parse } from "url";
import {
  metadata,
  SAMPLE_DATABASE,
  ORDERS,
  PRODUCTS,
  createMetadata,
} from "__support__/sample_database_fixture";

import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { deserializeCardFromUrl } from "metabase/lib/card";

import { TYPE as SEMANTIC_TYPE } from "cljs/metabase.types";

const card = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE.id,
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
    database: SAMPLE_DATABASE.id,
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
    database: SAMPLE_DATABASE.id,
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
    database: SAMPLE_DATABASE.id,
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
    database: SAMPLE_DATABASE.id,
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
    database: SAMPLE_DATABASE.id,
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
        databaseId: SAMPLE_DATABASE.id,
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

    describe("maybeUnlockDisplay", () => {
      it("should keep display locked when it was locked with unsensible display", () => {
        const sensibleDisplays = ["table", "scalar"];
        const previousSensibleDisplays = sensibleDisplays;
        const question = new Question(orders_count_card, metadata)
          .setDisplay("funnel")
          .lockDisplay()
          .maybeUnlockDisplay(sensibleDisplays, previousSensibleDisplays);

        expect(question.displayIsLocked()).toBe(true);
      });

      it("should unlock display it was locked with sensible display which has become unsensible", () => {
        const previousSensibleDisplays = ["funnel"];
        const sensibleDisplays = ["table", "scalar"];
        const question = new Question(orders_count_card, metadata)
          .setDisplay("funnel")
          .lockDisplay()
          .maybeUnlockDisplay(sensibleDisplays, previousSensibleDisplays);

        expect(question.displayIsLocked()).toBe(false);
      });
    });
  });

  // TODO: These are mode-dependent and should probably be tied to modes
  // At the same time, the choice that which actions are visible depend on the question's properties
  // as actions are filtered using those
  describe("METHODS FOR DRILL-THROUGH / ACTION WIDGET", () => {
    const rawDataQuestion = new Question(orders_raw_card, metadata);
    const timeBreakoutQuestion = Question.create({
      databaseId: SAMPLE_DATABASE.id,
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

    describe("aggregate(...)", () => {
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

    describe("breakout(...)", () => {
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
          database: SAMPLE_DATABASE.id,
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
          database: SAMPLE_DATABASE.id,
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

    describe("pivot(...)", () => {
      const ordersCountQuestion = new Question(orders_count_card, metadata);
      it("works with a datetime dimension ", () => {
        const pivoted = ordersCountQuestion.pivot([
          ["field", ORDERS.CREATED_AT.id, null],
        ]);
        expect(pivoted.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(pivoted._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATABASE.id,
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
          database: SAMPLE_DATABASE.id,
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

    describe("filter(...)", () => {
      const questionForFiltering = new Question(orders_raw_card, metadata);

      it("works with an id filter", () => {
        const filteringQuestion = questionForFiltering.filter(
          "=",
          ORDERS.ID.column(),
          1,
        );

        expect(filteringQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATABASE.id,
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
          database: SAMPLE_DATABASE.id,
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
          database: SAMPLE_DATABASE.id,
          query: {
            "source-table": ORDERS.id,
            filter: ["=", ["field", ORDERS.CREATED_AT.id, null], "12/12/2012"],
          },
        });
      });
    });

    describe("drillUnderlyingRecords(...)", () => {
      const ordersCountQuestion = new Question(
        orders_count_by_id_card,
        metadata,
      );

      // ???
      it("applies a filter to a given filterspec", () => {
        const dimensions = [{ value: 1, column: ORDERS.ID.column() }];

        const drilledQuestion =
          ordersCountQuestion.drillUnderlyingRecords(dimensions);
        expect(drilledQuestion.canRun()).toBe(true);

        expect(drilledQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATABASE.id,
          query: {
            "source-table": ORDERS.id,
            filter: ["=", ["field", ORDERS.ID.id, null], 1],
          },
        });
      });
    });

    describe("toUnderlyingRecords(...)", () => {
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
        const underlyingRecordsQuestion =
          ordersCountQuestion.toUnderlyingRecords();

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

    describe("toUnderlyingData()", () => {
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

    describe("drillPK(...)", () => {
      const question = new Question(orders_raw_card, metadata);
      it("returns the correct query for a PK detail drill-through", () => {
        const drilledQuestion = question.drillPK(ORDERS.ID, 1);

        expect(drilledQuestion.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(drilledQuestion._card.dataset_query).toEqual({
          type: "query",
          database: SAMPLE_DATABASE.id,
          query: {
            "source-table": ORDERS.id,
            filter: ["=", ["field", ORDERS.ID.id, null], 1],
          },
        });
      });

      describe("with composite PK", () => {
        // Making TOTAL a PK column in addition to ID
        const metadata = createMetadata(state =>
          state.assocIn(
            ["entities", "fields", ORDERS.TOTAL.id, "semantic_type"],
            "type/PK",
          ),
        );
        let question;

        beforeEach(() => {
          question = new Question(orders_raw_card, metadata);
        });

        it("when drills to one column of a composite key returns equals filter by the column", () => {
          const drilledQuestion = question.drillPK(ORDERS.ID, 1);

          expect(drilledQuestion.canRun()).toBe(true);
          expect(drilledQuestion._card.dataset_query).toEqual({
            type: "query",
            database: SAMPLE_DATABASE.id,
            query: {
              "source-table": ORDERS.id,
              filter: ["=", ["field", ORDERS.ID.id, null], 1],
            },
          });
        });

        it("when drills to both columns of a composite key returns query with equality filter by both PKs", () => {
          const drilledQuestion = question
            .drillPK(ORDERS.ID, 1)
            .drillPK(ORDERS.TOTAL, 1);

          expect(drilledQuestion.canRun()).toBe(true);
          expect(drilledQuestion._card.dataset_query).toEqual({
            type: "query",
            database: SAMPLE_DATABASE.id,
            query: {
              "source-table": ORDERS.id,
              filter: [
                "and",
                ["=", ["field", ORDERS.TOTAL.id, null], 1],
                ["=", ["field", ORDERS.ID.id, null], 1],
              ],
            },
          });
        });

        it("when drills to other table PK removes the previous table PK filters", () => {
          const drilledQuestion = question
            .drillPK(ORDERS.ID, 1)
            .drillPK(PRODUCTS.ID, 1);

          expect(drilledQuestion.canRun()).toBe(true);
          expect(drilledQuestion._card.dataset_query).toEqual({
            type: "query",
            database: SAMPLE_DATABASE.id,
            query: {
              "source-table": PRODUCTS.id,
              filter: ["=", ["field", PRODUCTS.ID.id, null], 1],
            },
          });
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
    const adhocUrl =
      "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJxdWVyeSI6eyJzb3VyY2UtdGFibGUiOjF9LCJ0eXBlIjoicXVlcnkifSwiZGlzcGxheSI6InRhYmxlIiwibmFtZSI6IlJhdyBvcmRlcnMgZGF0YSIsInZpc3VhbGl6YXRpb25fc2V0dGluZ3MiOnt9fQ==";

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
        expect(question.getUrl()).toBe(adhocUrl);
      });
    });

    it("should avoid generating URLs with transient IDs", () => {
      const question = new Question(
        assoc(orders_raw_card, "id", "foo"),
        metadata,
      );

      expect(question.getUrl()).toBe(adhocUrl);
    });
  });

  describe("Question.prototype._syncNativeQuerySettings", () => {
    let question;
    const cols = [
      {
        display_name: "num",
        source: "native",
        field_ref: [
          "field",
          "num",
          {
            "base-type": "type/Float",
          },
        ],
        name: "num",
        base_type: "type/Float",
      },
      {
        display_name: "text",
        source: "native",
        field_ref: [
          "field",
          "text",
          {
            "base-type": "type/Text",
          },
        ],
        name: "text",
        base_type: "type/Text",
      },
    ];

    const vizSettingCols = [
      {
        name: "num",
        fieldRef: ["field", "num", { "base-type": "type/Float" }],
        enabled: true,
      },
      {
        name: "text",
        fieldRef: ["field", "text", { "base-type": "type/Text" }],
        enabled: true,
      },
    ];

    beforeEach(() => {
      question = new Question(native_orders_count_card, metadata);
      question.setting = jest.fn();
      question.updateSettings = jest.fn();
    });

    describe("when columns have not been defined", () => {
      it("should do nothing when given no cols", () => {
        question._syncNativeQuerySettings({});
        question._syncNativeQuerySettings({ data: { cols: [] } });
        question._syncNativeQuerySettings({ data: { cols } });

        expect(question.updateSettings).not.toHaveBeenCalled();
      });

      it("should do nothing when given cols", () => {
        question._syncNativeQuerySettings({ data: { cols } });

        expect(question.updateSettings).not.toHaveBeenCalled();
      });
    });

    describe("after vizSetting columns have been defined", () => {
      beforeEach(() => {
        question.setting.mockImplementation(property => {
          if (property === "table.columns") {
            return vizSettingCols;
          }
        });
      });

      it("should handle the addition and removal of columns", () => {
        question._syncNativeQuerySettings({
          data: {
            cols: [
              ...cols.slice(1),
              {
                display_name: "foo",
                source: "native",
                field_ref: [
                  "field",
                  "foo",
                  {
                    "base-type": "type/Float",
                  },
                ],
                name: "foo",
                base_type: "type/Float",
              },
            ],
          },
        });

        expect(question.updateSettings).toHaveBeenCalledWith({
          "table.columns": [
            ...vizSettingCols.slice(1),
            {
              name: "foo",
              fieldRef: [
                "field",
                "foo",
                {
                  "base-type": "type/Float",
                },
              ],
              enabled: true,
            },
          ],
        });
      });

      it("should handle the mutation of extraneous column props", () => {
        question._syncNativeQuerySettings({
          data: {
            cols: [
              {
                display_name: "num with mutated display_name",
                source: "native",
                field_ref: [
                  "field",
                  "num",
                  {
                    "base-type": "type/Float",
                  },
                ],
                name: "foo",
                base_type: "type/Float",
              },
              ...cols.slice(1),
            ],
          },
        });

        expect(question.updateSettings).not.toHaveBeenCalled();
      });

      it("should handle the mutation of a field_ref on an existing column", () => {
        question._syncNativeQuerySettings({
          data: {
            cols: [
              {
                display_name: "foo",
                source: "native",
                field_ref: [
                  "field",
                  "foo",
                  {
                    "base-type": "type/Integer",
                  },
                ],
                name: "foo",
                base_type: "type/Integer",
              },
              ...cols.slice(1),
            ],
          },
        });

        expect(question.updateSettings).toHaveBeenCalledWith({
          "table.columns": [
            ...vizSettingCols.slice(1),
            {
              name: "foo",
              fieldRef: ["field", "foo", { "base-type": "type/Integer" }],
              enabled: true,
            },
          ],
        });
      });
    });
  });

  describe("Question.prototype.getResultMetadata", () => {
    it("should return the `result_metadata` property off the underlying card", () => {
      const question = new Question(
        { ...card, result_metadata: [1, 2, 3] },
        metadata,
      );
      expect(question.getResultMetadata()).toEqual([1, 2, 3]);
    });

    it("should default to an array", () => {
      const question = new Question(
        { ...card, result_metadata: null },
        metadata,
      );
      expect(question.getResultMetadata()).toEqual([]);
    });
  });

  describe("Question.prototype.dependentMetadata", () => {
    it("should return model FK field targets", () => {
      const question = new Question(
        {
          ...card,
          dataset: true,
          result_metadata: [
            { semantic_type: SEMANTIC_TYPE.FK, fk_target_field_id: 5 },
          ],
        },
        metadata,
      );

      expect(question.dependentMetadata()).toEqual([{ type: "field", id: 5 }]);
    });

    it("should return skip with with FK target field which are not FKs semantically", () => {
      const question = new Question(
        {
          ...card,
          dataset: true,
          result_metadata: [{ fk_target_field_id: 5 }],
        },
        metadata,
      );

      expect(question.dependentMetadata()).toEqual([]);
    });

    it("should return nothing for regular questions", () => {
      const question = new Question(
        {
          ...card,
          result_metadata: [
            { semantic_type: SEMANTIC_TYPE.FK, fk_target_field_id: 5 },
          ],
        },
        metadata,
      );

      expect(question.dependentMetadata()).toEqual([]);
    });
  });

  describe("Question.prototype.setDashboardProps", () => {
    it("should set a `dashboardId` property and a `dashcardId` property on the question's card", () => {
      const question = new Question(card, metadata);
      const questionWithDashboardId = question.setDashboardProps({
        dashboardId: 123,
        dashcardId: 456,
      });

      expect(question).not.toBe(questionWithDashboardId);
      expect(questionWithDashboardId.card().dashboardId).toEqual(123);
      expect(questionWithDashboardId.card().dashcardId).toEqual(456);
    });
  });

  describe("Question.prototype.setParameters", () => {
    it("should set a `parameters` property on the question's card", () => {
      const parameters = [{ type: "category" }];
      const question = new Question(card, metadata);
      const questionWithParameters = question.setParameters(parameters);

      expect(question).not.toBe(questionWithParameters);
      expect(questionWithParameters.card().parameters).toEqual(parameters);
    });
  });

  describe("Question.prototype.setParameterValues", () => {
    it("should set a `_parameterValues` property on the question", () => {
      const parameterValues = { foo: "bar" };
      const question = new Question(card, metadata);
      const questionWithParameterValues =
        question.setParameterValues(parameterValues);

      expect(question).not.toBe(questionWithParameterValues);
      expect(questionWithParameterValues._parameterValues).toEqual(
        parameterValues,
      );
    });
  });

  describe("Question.prototype.parameters", () => {
    it("should return an empty array if no parameters are set on the structured question", () => {
      const question = new Question(card, metadata);
      expect(question.parameters()).toEqual([]);
    });

    it("should return the template tags of a native question", () => {
      const nativeQuestionWithTemplateTags = {
        ...native_orders_count_card,
        dataset_query: {
          ...native_orders_count_card.dataset_query,
          native: {
            ...native_orders_count_card.dataset_query.native,
            "template-tags": {
              foo: {
                name: "foo",
                "display-name": "Foo",
                id: "bbb",
                type: "dimension",
                "widget-type": "category",
                dimension: ["field", PRODUCTS.CATEGORY.id, null],
              },
              bar: {
                name: "bar",
                "display-name": "Bar",
                id: "aaa",
                type: "text",
              },
            },
          },
        },
      };

      const question = new Question(nativeQuestionWithTemplateTags, metadata);
      expect(question.parameters()).toEqual([
        {
          default: undefined,
          fields: [
            expect.objectContaining({
              id: PRODUCTS.CATEGORY.id,
            }),
          ],
          hasVariableTemplateTagTarget: false,
          id: "bbb",
          name: "Foo",
          slug: "foo",
          target: ["dimension", ["template-tag", "foo"]],
          type: "category",
        },
        {
          default: undefined,
          hasVariableTemplateTagTarget: true,
          id: "aaa",
          name: "Bar",
          slug: "bar",
          target: ["variable", ["template-tag", "bar"]],
          type: "category",
        },
      ]);
    });

    it("should return a question's parameters + metadata and the parameter's value if present", () => {
      const question = new Question(card, metadata)
        .setParameters([
          {
            type: "category",
            name: "foo",
            id: "foo_id",
            target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
          },
          {
            type: "category",
            name: "bar",
            id: "bar_id",
          },
        ])
        .setParameterValues({
          foo_id: "abc",
        });
      const parameters = question.parameters();

      expect(parameters).toEqual([
        {
          type: "category",
          name: "foo",
          id: "foo_id",
          target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
          value: "abc",
          fields: [
            expect.objectContaining({
              id: PRODUCTS.CATEGORY.id,
            }),
          ],
          hasVariableTemplateTagTarget: false,
        },
        {
          type: "category",
          name: "bar",
          id: "bar_id",
          hasVariableTemplateTagTarget: true,
        },
      ]);
    });
  });

  describe("Question.prototype.convertParametersToMbql", () => {
    it("should do nothing to a native question", () => {
      const question = new Question(native_orders_count_card, metadata);
      expect(question.convertParametersToMbql()).toBe(question);
    });

    it("should convert a question with parameters into a new question with filters", () => {
      const parameters = [
        {
          type: "string/starts-with",
          name: "foo",
          id: "foo_id",
          target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
        },
        {
          type: "string/=",
          name: "bar",
          id: "bar_id",
          target: ["dimension", ["field", PRODUCTS.CATEGORY.id, null]],
        },
      ];

      const question = new Question(card, metadata)
        .setParameters(parameters)
        .setParameterValues({
          foo_id: "abc",
        });

      const questionWithFilters = question.convertParametersToMbql();

      expect(questionWithFilters.card().dataset_query.query.filter).toEqual([
        "starts-with",
        ["field", PRODUCTS.CATEGORY.id, null],
        "abc",
      ]);
    });
  });

  describe("Question.prototype.getUrlWithParameters", () => {
    const parameters = [
      {
        id: 1,
        slug: "param_string",
        type: "category",
        target: ["dimension", ["field", 1, null]],
      },
      {
        id: 2,
        slug: "param_operator",
        type: "category/starts-with",
        target: ["dimension", ["field", 2, null]],
      },
      {
        id: 3,
        slug: "param_date",
        type: "date/month",
        target: ["dimension", ["field", 3, null]],
      },
      {
        id: 4,
        slug: "param_fk",
        type: "date/month",
        target: ["dimension", ["field", 2, { "source-field": 1 }]],
      },
      {
        id: 5,
        slug: "param_number",
        type: "number/=",
        target: ["dimension", ["field", 2, null]],
      },
    ];

    const card = {
      id: 1,
      dataset_query: {
        type: "query",
        query: {
          "source-table": 1,
        },
        database: 1,
      },
    };

    describe("with structured card", () => {
      let question;
      beforeEach(() => {
        question = new Question(card, metadata);
      });

      it("should return question URL with no parameters", () => {
        const parameters = [];
        const parameterValues = {};

        const url = question.getUrlWithParameters(parameters, parameterValues);

        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: {},
          card: null,
        });
      });

      it("should return question URL with string MBQL filter added", () => {
        const url = question.getUrlWithParameters(parameters, { 1: "bar" });

        const deserializedCard = {
          ...assocIn(
            dissoc(card, "id"),
            ["dataset_query", "query", "filter"],
            ["=", ["field", 1, null], "bar"],
          ),
          original_card_id: card.id,
        };

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: deserializedCard,
        });
      });

      it("should return question URL with number MBQL filter added", () => {
        const url = question.getUrlWithParameters(parameters, { 5: 123 });

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: {
            ...assocIn(
              dissoc(card, "id"),
              ["dataset_query", "query", "filter"],
              ["=", ["field", 2, null], 123],
            ),
            original_card_id: card.id,
          },
        });
      });

      it("should return question URL with date MBQL filter added", () => {
        const url = question.getUrlWithParameters(parameters, {
          3: "2017-05",
        });

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {},
          card: {
            ...assocIn(
              dissoc(card, "id"),
              ["dataset_query", "query", "filter"],
              ["=", ["field", 3, { "temporal-unit": "month" }], "2017-05-01"],
            ),
            original_card_id: card.id,
          },
        });
      });

      it("should include objectId in a URL", () => {
        const OBJECT_ID = "5";
        const url = question.getUrlWithParameters(
          parameters,
          { 1: "bar" },
          { objectId: OBJECT_ID },
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: { objectId: OBJECT_ID },
          card: expect.any(Object),
        });
      });
    });

    describe("with structured question & no permissions", () => {
      let question;
      beforeEach(() => {
        question = new Question(card);
      });

      it("should return a card with attached parameters and parameter values as query params", () => {
        const url = question.getUrlWithParameters(parameters, { 1: "bar" });

        const deserializedCard = {
          ...card,
          parameters,
          id: undefined,
          original_card_id: card.id,
        };

        expect(parseUrl(url)).toEqual({
          pathname: "/question",
          query: {
            param_string: "bar",
          },
          card: deserializedCard,
        });
      });

      it("should not include objectId in a URL", () => {
        const url = question.getUrlWithParameters(
          parameters,
          { 1: "bar" },
          { objectId: 5 },
        );

        expect(parseUrl(url).query.objectId).toBeUndefined();
      });
    });

    describe("with a native question", () => {
      const cardWithTextFilter = {
        id: 1,
        dataset_query: {
          type: "native",
          native: {
            "template-tags": {
              baz: { name: "baz", type: "text", id: "foo" },
            },
          },
        },
      };

      const parametersForNativeQ = [
        {
          ...parameters[0],
          target: ["variable", ["template-tag", "baz"]],
        },
        {
          ...parameters[4],
          target: ["dimension", ["template-tag", "bar"]],
        },
      ];

      const cardWithFieldFilter = {
        id: 2,
        dataset_query: {
          type: "native",
          native: {
            "template-tags": {
              bar: { name: "bar", type: "number/=", id: "abc" },
            },
          },
        },
      };

      let question;
      beforeEach(() => {
        question = new Question(cardWithTextFilter, metadata);
      });

      it("should return question URL when there are no parameters", () => {
        const url = question.getUrlWithParameters([], {});
        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: {},
          card: null,
        });
      });

      it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's variable", () => {
        const url = question.getUrlWithParameters(parametersForNativeQ, {
          1: "bar",
        });

        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: { baz: "bar" },
          card: null,
        });
      });

      it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's field filter", () => {
        const question = new Question(cardWithFieldFilter, metadata);
        const url = question.getUrlWithParameters(parametersForNativeQ, {
          5: "111",
        });

        expect(parseUrl(url)).toEqual({
          pathname: "/question/2",
          query: { bar: "111" },
          card: null,
        });
      });

      it("should not include objectId in a URL", () => {
        const url = question.getUrlWithParameters(parametersForNativeQ, {
          1: "bar",
        });
        expect(parseUrl(url).query.objectId).toBeUndefined();
      });
    });
  });

  describe("Question.prototype.omitTransientCardIds", () => {
    it("should return a question without a transient ids", () => {
      const cardWithTransientId = {
        ...card,
        id: "foo",
        original_card_id: 123,
      };

      const question = new Question(cardWithTransientId, metadata);
      const newQuestion = question.omitTransientCardIds();
      expect(newQuestion.id()).toBeUndefined();
      expect(newQuestion.card().original_card_id).toBe(123);
    });

    it("should return a question without a transient original_card_id", () => {
      const cardWithTransientId = {
        ...card,
        id: 123,
        original_card_id: "bar",
      };

      const question = new Question(cardWithTransientId, metadata);
      const newQuestion = question.omitTransientCardIds();
      expect(newQuestion.card().original_card_id).toBeUndefined();
      expect(newQuestion.id()).toBe(123);
    });

    it("should do nothing if id and original_card_id are both not transient", () => {
      const cardWithoutTransientId = {
        ...card,
        id: 123,
        original_card_id: undefined,
      };

      const question = new Question(cardWithoutTransientId, metadata);
      const newQuestion = question.omitTransientCardIds();

      expect(newQuestion).toBe(question);
    });
  });
});

function parseUrl(url) {
  const parsed = parse(url, true);
  return {
    card: parsed.hash && deserializeCardFromUrl(parsed.hash),
    query: parsed.query,
    pathname: parsed.pathname,
  };
}
