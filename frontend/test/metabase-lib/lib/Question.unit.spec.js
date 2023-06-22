import { assoc, dissoc, assocIn } from "icepick";
import { parse } from "url";
import { createMockMetadata } from "__support__/metadata";
import { deserializeCardFromUrl } from "metabase/lib/card";
import { createMockMetric } from "metabase-types/api/mocks";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
  createOrdersIdField,
  createOrdersUserIdField,
  createOrdersProductIdField,
  createOrdersSubtotalField,
  createOrdersTaxField,
  createOrdersTotalField,
  createOrdersDiscountField,
  createOrdersCreatedAtField,
  createOrdersQuantityField,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { TYPE as SEMANTIC_TYPE } from "cljs/metabase.types";
import Question from "metabase-lib/Question";
import * as ML_Urls from "metabase-lib/urls";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/queries/NativeQuery";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  metrics: [
    createMockMetric({
      id: 2,
      table_id: ORDERS_ID,
      name: "Total Order Value",
      definition: {
        filter: [">", ORDERS.TOTAL, 20],
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        "source-table": ORDERS_ID,
      },
    }),
  ],
});

const card = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};
const base_question = new Question(card, metadata);

const orders_raw_card = {
  id: 1,
  name: "Raw orders data",
  display: "table",
  visualization_settings: {},
  can_write: true,
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};
const orders_raw_question = new Question(orders_raw_card, metadata);

const orders_count_card = {
  id: 2,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  },
};
const orders_count_question = new Question(orders_count_card, metadata);

const orders_count_where_card = {
  id: 2,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count-where", [">", ORDERS.TOTAL, 50]]],
    },
  },
};
const orders_count_where_question = new Question(
  orders_count_where_card,
  metadata,
);

const orders_metric_filter_card = {
  id: 2,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["metric", 2]],
    },
  },
};
const orders_metric_filter_question = new Question(
  orders_metric_filter_card,
  metadata,
);

const orders_filter_card = {
  id: 2,
  name: "# orders data",
  display: "line",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      filter: [">", ["field", ORDERS.TOTAL, null], 10],
    },
  },
};

const orders_join_card = {
  id: 2,
  name: "# orders data",
  display: "line",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field-id", ORDERS.PRODUCT_ID],
            ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
          ],
          alias: "Products",
        },
      ],
    },
  },
};

const orders_expression_card = {
  id: 2,
  name: "# orders data",
  display: "line",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      expressions: { double_total: ["+", 1, 1] },
    },
  },
};

const orders_multi_stage_card = {
  id: 2,
  name: "# orders data",
  display: "line",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        filter: [">", ["field", ORDERS.TOTAL, null], 10],
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 20],
    },
  },
};
const orders_multi_stage_question = new Question(
  orders_multi_stage_card,
  metadata,
);

const native_orders_count_card = {
  id: 3,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "native",
    database: SAMPLE_DB_ID,
    native: {
      query: "SELECT count(*) FROM orders",
    },
  },
};
const native_orders_count_question = new Question(
  native_orders_count_card,
  metadata,
);

const invalid_orders_count_card = {
  id: 2,
  name: "# orders data",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "nosuchqueryprocessor",
    database: SAMPLE_DB_ID,
    query: {
      query: "SELECT count(*) FROM orders",
    },
  },
};
const invalid_orders_count_question = new Question(
  invalid_orders_count_card,
  metadata,
);

const orders_count_by_id_card = {
  id: 2,
  name: "# orders data",
  can_write: false,
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.ID, null]],
    },
  },
};
const orders_count_by_id_question = new Question(
  orders_count_by_id_card,
  metadata,
);

describe("Question", () => {
  describe("CREATED WITH", () => {
    describe("new Question(alreadyDefinedCard, metadata)", () => {
      it("isn't empty", () => {
        expect(orders_raw_question.isEmpty()).toBe(false);
      });
      it("has an id", () => {
        expect(orders_raw_question.id()).toBe(orders_raw_card.id);
      });
      it("has a name", () => {
        expect(orders_raw_question.displayName()).toBe(orders_raw_card.name);
      });
      it("is runnable", () => {
        expect(orders_raw_question.canRun()).toBe(true);
      });
      it("has correct display settings", () => {
        expect(orders_raw_question.display()).toBe("table");
      });
    });

    describe("Question.create(...)", () => {
      const question = Question.create({
        metadata,
        databaseId: SAMPLE_DB_ID,
        tableId: ORDERS_ID,
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
        expect(orders_raw_question.canRun()).toBe(true);
      });
    });
    describe("canWrite()", () => {
      it("You should be able to write to a question you have permissions to", () => {
        expect(orders_raw_question.canWrite()).toBe(true);
      });
      it("You should not be able to write to a question you don't have permissions to", () => {
        expect(orders_count_by_id_question.canWrite()).toBe(false);
      });
    });
    describe("isSaved()", () => {
      it("A newly created query doesn't have an id and shouldn't be marked as isSaved()", () => {
        expect(base_question.isSaved()).toBe(false);
      });
      it("A saved question does have an id and should be marked as isSaved()", () => {
        expect(orders_raw_question.isSaved()).toBe(true);
      });
    });
  });

  describe("At the heart of a question is an MBQL query.", () => {
    describe("query()", () => {
      it("returns a correct class instance for structured query", () => {
        // This is a bit wack, and the repetitive naming is pretty confusing.
        const query = orders_raw_question.query();
        expect(query instanceof StructuredQuery).toBe(true);
      });
      it("returns a correct class instance for native query", () => {
        const query = native_orders_count_question.query();
        expect(query instanceof NativeQuery).toBe(true);
      });
      it("throws an error for invalid queries", () => {
        expect(invalid_orders_count_question.query).toThrow();
      });
    });
    describe("setQuery(query)", () => {
      it("updates the dataset_query of card", () => {
        const rawQuery = native_orders_count_question.query();
        const newRawQuestion = orders_raw_question.setQuery(rawQuery);
        expect(newRawQuestion.query() instanceof NativeQuery).toBe(true);
      });
    });
    describe("setDatasetQuery(datasetQuery)", () => {
      it("updates the dataset_query of card", () => {
        const rawQuestion = orders_raw_question.setDatasetQuery(
          native_orders_count_question.datasetQuery(),
        );

        expect(rawQuestion.query() instanceof NativeQuery).toBe(true);
      });
    });
  });

  describe("RESETTING METHODS", () => {
    describe("withoutNameAndId()", () => {
      it("unsets the name and id", () => {
        const newQuestion = orders_raw_question.withoutNameAndId();

        expect(newQuestion.id()).toBeUndefined();
        expect(newQuestion.displayName()).toBeUndefined();
      });
      it("does not change the original", () => {
        expect(orders_raw_question.id()).toBeDefined();
        expect(orders_raw_question.displayName()).toBeDefined();
      });
    });
  });

  describe("VISUALIZATION METHODS", () => {
    describe("display()", () => {
      it("returns the card's visualization type", () => {
        // This forces a table view.
        const tableQuestion = orders_raw_question.toUnderlyingData();
        // Not sure I'm a huge fan of magic strings here.
        expect(tableQuestion.display()).toBe("table");
      });
    });
    describe("setDisplay(display)", () => {
      it("sets the card's visualization type", () => {
        // Not sure I'm a huge fan of magic strings here.
        const scalarQuestion = orders_raw_question.setDisplay("scalar");
        expect(scalarQuestion.display()).toBe("scalar");
        expect(orders_raw_question.display()).not.toBe("scalar");
      });
    });
    describe("setDefaultDisplay", () => {
      it("sets display to 'scalar' for order count", () => {
        const question = orders_count_question.setDefaultDisplay();
        expect(question.display()).toBe("scalar");
      });

      it("should not set the display to scalar if table was selected", () => {
        const question = orders_count_question
          .setDisplay("table")
          .lockDisplay()
          .maybeUnlockDisplay(["table", "scalar"])
          .setDefaultDisplay();

        expect(question.display()).toBe("table");
      });

      it("should set the display to scalar if funnel was selected", () => {
        const question = orders_count_question
          .setDisplay("funnel")
          .lockDisplay()
          .maybeUnlockDisplay(["table", "scalar"])
          .setDefaultDisplay();

        expect(question.display()).toBe("scalar");
      });
    });

    describe("maybeUnlockDisplay", () => {
      it("should keep display locked when it was locked with nonsense display", () => {
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
        const question = orders_count_question
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
    describe("aggregate(...)", () => {
      it("returns the correct query for a summarization of a raw data table", () => {
        const summarizedQuestion = orders_raw_question.aggregate(["count"]);
        expect(summarizedQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(summarizedQuestion.datasetQuery()).toEqual(
          orders_count_card.dataset_query,
        );
      });
    });

    describe("breakout(...)", () => {
      it("works with a datetime field reference", () => {
        const brokenOutCard = orders_count_question.breakout([
          "field",
          ORDERS.CREATED_AT,
          null,
        ]);
        expect(brokenOutCard.canRun()).toBe(true);

        expect(brokenOutCard.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.CREATED_AT, null]],
          },
        });

        // Make sure we haven't mutated the underlying query
        expect(orders_count_question.datasetQuery().query).toEqual({
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        });
      });
      it("works with a primary key field reference", () => {
        const brokenOutQuestion = orders_count_question.breakout([
          "field",
          ORDERS.ID,
          null,
        ]);
        expect(brokenOutQuestion.canRun()).toBe(true);
        // This breaks because we're apparently modifying OrdersCountDataCard
        expect(brokenOutQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.ID, null]],
          },
        });

        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        });
      });
    });

    describe("pivot(...)", () => {
      it("works with a datetime dimension", () => {
        const pivoted = orders_count_question.pivot([
          ["field", ORDERS.CREATED_AT, null],
        ]);
        expect(pivoted.canRun()).toBe(true);

        expect(pivoted.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.CREATED_AT, null]],
          },
        });
        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        });
      });
      it("works with PK dimension", () => {
        const pivoted = orders_count_question.pivot([
          ["field", ORDERS.ID, null],
        ]);
        expect(pivoted.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(pivoted.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.ID, null]],
          },
        });
        // Make sure we haven't mutated the underlying query
        expect(orders_count_card.dataset_query.query).toEqual({
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        });
      });
    });

    describe("filter(...)", () => {
      const questionForFiltering = orders_raw_question;

      it("works with an id filter", () => {
        const ordersId = metadata.field(ORDERS.ID);
        const filteringQuestion = questionForFiltering.filter(
          "=",
          ordersId.column(),
          1,
        );

        expect(filteringQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: ["=", ["field", ORDERS.ID, null], 1],
          },
        });
      });
      it("works with a categorical value filter", () => {
        const ordersProductId = metadata.field(ORDERS.PRODUCT_ID);
        const productsCategory = metadata.field(PRODUCTS.CATEGORY);
        const filteringQuestion = questionForFiltering.filter(
          "=",
          ordersProductId.foreign(productsCategory).column(),
          "Doohickey",
        );

        expect(filteringQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [
              "=",
              [
                "field",
                PRODUCTS.CATEGORY,
                { "source-field": ORDERS.PRODUCT_ID },
              ],
              "Doohickey",
            ],
          },
        });
      });

      it("works with a time filter", () => {
        const ordersCreatedAt = metadata.field(ORDERS.CREATED_AT);
        const filteringQuestion = questionForFiltering.filter(
          "=",
          ordersCreatedAt.column(),
          "12/12/2012",
        );

        expect(filteringQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: ["=", ["field", ORDERS.CREATED_AT, null], "12/12/2012"],
          },
        });
      });
    });

    describe("drillUnderlyingRecords(...)", () => {
      it("applies a filter to a given query", () => {
        const ordersId = metadata.field(ORDERS.ID);
        const dimensions = [{ value: 1, column: ordersId.column() }];

        const newQuestion =
          orders_count_by_id_question.drillUnderlyingRecords(dimensions);

        expect(newQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: ["=", ["field", ORDERS.ID, null], 1],
          },
        });
      });

      it("applies a filter from an aggregation to a given query", () => {
        const ordersId = metadata.field(ORDERS.ID);
        const dimensions = [{ value: 1, column: ordersId.column() }];
        const column = { field_ref: ["aggregation", 0] };

        const newQuestion = orders_count_where_question.drillUnderlyingRecords(
          dimensions,
          column,
        );

        expect(newQuestion.canRun()).toBe(true);
        expect(newQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [
              "and",
              ["=", ["field", ORDERS.ID, null], 1],
              [">", ["field", ORDERS.TOTAL, null], 50],
            ],
          },
        });
      });

      it("applies a filter from a metric to a given query", () => {
        const ordersId = metadata.field(ORDERS.ID);
        const dimensions = [{ value: 1, column: ordersId.column() }];
        const column = { field_ref: ["aggregation", 0] };

        const newQuestion =
          orders_metric_filter_question.drillUnderlyingRecords(
            dimensions,
            column,
          );

        expect(newQuestion.canRun()).toBe(true);
        expect(newQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [
              "and",
              ["=", ["field", ORDERS.ID, null], 1],
              [">", ["field", ORDERS.TOTAL, null], 20],
            ],
          },
        });
      });

      it("removes post-aggregation filters from a given query", () => {
        const ordersId = metadata.field(ORDERS.ID);
        const dimensions = [{ value: 1, column: ordersId.column() }];

        const newQuestion = orders_multi_stage_question
          .topLevelQuestion()
          .drillUnderlyingRecords(dimensions);

        expect(newQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [
              "and",
              [">", ["field", ORDERS.TOTAL, null], 10],
              ["=", ["field", ORDERS.ID, null], 1],
            ],
          },
        });
      });
    });

    describe("toUnderlyingRecords(...)", () => {
      it("returns underlying records correctly for a raw data query", () => {
        const underlyingRecordsQuestion =
          orders_raw_question.toUnderlyingRecords();

        expect(underlyingRecordsQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(underlyingRecordsQuestion.datasetQuery()).toEqual(
          orders_raw_card.dataset_query,
        );

        // Make sure we haven't mutated the underlying query
        expect(orders_raw_card.dataset_query.query).toEqual({
          "source-table": ORDERS_ID,
        });
      });
      it("returns underlying records correctly for a broken out query", () => {
        const underlyingRecordsQuestion =
          orders_count_question.toUnderlyingRecords();

        expect(underlyingRecordsQuestion.canRun()).toBe(true);
        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(underlyingRecordsQuestion.datasetQuery()).toEqual(
          orders_raw_card.dataset_query,
        );

        // Make sure we haven't mutated the underlying query
        expect(orders_raw_card.dataset_query.query).toEqual({
          "source-table": ORDERS_ID,
        });
      });
    });

    describe("toUnderlyingData()", () => {
      it("returns underlying data correctly for table query", () => {
        const underlyingDataQuestion = orders_count_question
          .setDisplay("table")
          .toUnderlyingData();

        expect(underlyingDataQuestion.display()).toBe("table");
      });
      it("returns underlying data correctly for line chart", () => {
        const underlyingDataQuestion = orders_count_question
          .setDisplay("line")
          .toUnderlyingData();

        expect(underlyingDataQuestion.display()).toBe("table");
      });
    });

    describe("drillPK(...)", () => {
      it("returns the correct query for a PK detail drill-through", () => {
        const ordersId = metadata.field(ORDERS.ID);
        const drilledQuestion = orders_raw_question.drillPK(ordersId, 1);

        expect(drilledQuestion.canRun()).toBe(true);

        // if I actually call the .query() method below, this blows up garbage collection =/
        expect(drilledQuestion.datasetQuery()).toEqual({
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: ["=", ["field", ORDERS.ID, null], 1],
          },
        });
      });

      describe("with composite PK", () => {
        // Making TOTAL a PK column in addition to ID
        const metadata = createMockMetadata({
          databases: [
            createSampleDatabase({
              tables: [
                createProductsTable(),
                createPeopleTable(),
                createReviewsTable(),
                createOrdersTable({
                  fields: [
                    createOrdersIdField(),
                    createOrdersUserIdField(),
                    createOrdersProductIdField(),
                    createOrdersSubtotalField(),
                    createOrdersTaxField(),
                    createOrdersTotalField({ semantic_type: "type/PK" }),
                    createOrdersDiscountField(),
                    createOrdersCreatedAtField(),
                    createOrdersQuantityField(),
                  ],
                }),
              ],
            }),
          ],
        });

        // Note: This is not orders_raw_question because we want the different metadata.
        const question = new Question(orders_raw_card, metadata);

        it("when drills to one column of a composite key returns equals filter by the column", () => {
          const ordersId = metadata.field(ORDERS.ID);
          const drilledQuestion = question.drillPK(ordersId, 1);

          expect(drilledQuestion.canRun()).toBe(true);
          expect(drilledQuestion.datasetQuery()).toEqual({
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: ["=", ["field", ORDERS.ID, null], 1],
            },
          });
        });

        it("when drills to both columns of a composite key returns query with equality filter by both PKs", () => {
          const ordersId = metadata.field(ORDERS.ID);
          const ordersTotal = metadata.field(ORDERS.TOTAL);

          const drilledQuestion = question
            .drillPK(ordersId, 1)
            .drillPK(ordersTotal, 1);

          expect(drilledQuestion.canRun()).toBe(true);
          expect(drilledQuestion.datasetQuery()).toEqual({
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
              filter: [
                "and",
                ["=", ["field", ORDERS.TOTAL, null], 1],
                ["=", ["field", ORDERS.ID, null], 1],
              ],
            },
          });
        });

        it("when drills to other table PK removes the previous table PK filters", () => {
          const ordersId = metadata.field(ORDERS.ID);
          const productsId = metadata.field(PRODUCTS.ID);

          const drilledQuestion = question
            .drillPK(ordersId, 1)
            .drillPK(productsId, 1);

          expect(drilledQuestion.canRun()).toBe(true);
          expect(drilledQuestion.datasetQuery()).toEqual({
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": PRODUCTS_ID,
              filter: ["=", ["field", PRODUCTS.ID, null], 1],
            },
          });
        });
      });
    });
  });

  describe("COMPARISON TO OTHER QUESTIONS", () => {
    describe("isDirtyComparedTo(question)", () => {
      it("New questions are automatically dirty", () => {
        const newQuestion = orders_raw_question.withoutNameAndId();
        expect(newQuestion.isDirtyComparedTo(orders_raw_question)).toBe(true);
      });
      it("Changing vis settings makes the question dirty", () => {
        const underlyingDataQuestion =
          orders_count_question.toUnderlyingRecords();
        expect(
          underlyingDataQuestion.isDirtyComparedTo(orders_count_question),
        ).toBe(true);
      });
    });
  });

  describe("URLs", () => {
    const adhocUrl =
      "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJxdWVyeSI6eyJzb3VyY2UtdGFibGUiOjJ9LCJ0eXBlIjoicXVlcnkifSwiZGlzcGxheSI6InRhYmxlIiwibmFtZSI6IlJhdyBvcmRlcnMgZGF0YSIsInZpc3VhbGl6YXRpb25fc2V0dGluZ3MiOnt9fQ==";

    // Covered a lot in query_builder/actions.spec.js, just very basic cases here
    // (currently getUrl has logic that is strongly tied to the logic query builder Redux actions)
    describe("getUrl(originalQuestion?)", () => {
      it("returns URL with ID for saved question", () => {
        const question = new Question(
          assoc(orders_raw_card, "id", 1),
          metadata,
        );
        expect(ML_Urls.getUrl(question)).toBe("/question/1-raw-orders-data");
      });
      it("returns a URL with hash for an unsaved question", () => {
        const question = new Question(dissoc(orders_raw_card, "id"), metadata);
        expect(ML_Urls.getUrl(question)).toBe(adhocUrl);
      });
    });

    it("should avoid generating URLs with transient IDs", () => {
      const question = new Question(
        assoc(orders_raw_card, "id", "foo"),
        metadata,
      );

      expect(ML_Urls.getUrl(question)).toBe(adhocUrl);
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
      question = native_orders_count_question.clone();
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
      const question = base_question.setResultsMetadata({ columns: [1, 2, 3] });
      expect(question.getResultMetadata()).toEqual([1, 2, 3]);
    });

    it("should default to an array", () => {
      const question = base_question.setResultsMetadata(null);
      expect(question.getResultMetadata()).toEqual([]);
    });
  });

  describe("Question.prototype.dependentMetadata", () => {
    it("should return model FK field targets", () => {
      const question = base_question.setResultsMetadata({
        columns: [{ semantic_type: SEMANTIC_TYPE.FK, fk_target_field_id: 5 }],
      });

      expect(question.dependentMetadata()).toEqual([{ type: "field", id: 5 }]);
    });

    it("should return skip with with FK target field which are not FKs semantically", () => {
      const question = base_question.setResultsMetadata({
        columns: [{ fk_target_field_id: 5 }],
      });

      expect(question.dependentMetadata()).toEqual([]);
    });
  });

  describe("Question.prototype.setDashboardProps", () => {
    it("should set a `dashboardId` property and a `dashcardId` property on the question's card", () => {
      const questionWithDashboardId = base_question.setDashboardProps({
        dashboardId: 123,
        dashcardId: 456,
      });

      expect(base_question).not.toBe(questionWithDashboardId);
      expect(
        questionWithDashboardId._doNotCallSerializableCard().dashboardId,
      ).toEqual(123);
      expect(
        questionWithDashboardId._doNotCallSerializableCard().dashcardId,
      ).toEqual(456);
    });
  });

  describe("Question.prototype.setParameters", () => {
    it("should set a `parameters` property on the question's card", () => {
      const parameters = [{ type: "category" }];
      const questionWithParameters = base_question.setParameters(parameters);

      expect(base_question).not.toBe(questionWithParameters);
      expect(
        questionWithParameters._doNotCallSerializableCard().parameters,
      ).toEqual(parameters);
    });
  });

  describe("Question.prototype.setParameterValues", () => {
    it("should set a `_parameterValues` property on the question", () => {
      const parameterValues = { foo: "bar" };
      const questionWithParameterValues =
        base_question.setParameterValues(parameterValues);

      expect(base_question).not.toBe(questionWithParameterValues);
      expect(questionWithParameterValues._parameterValues).toEqual(
        parameterValues,
      );
    });
  });

  describe("Question.prototype.parameters", () => {
    it("should return an empty array if no parameters are set on the structured question", () => {
      expect(base_question.parameters()).toEqual([]);
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
                dimension: ["field", PRODUCTS.CATEGORY, null],
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
              id: PRODUCTS.CATEGORY,
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
      const question = base_question
        .setParameters([
          {
            type: "category",
            name: "foo",
            id: "foo_id",
            target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
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

      expect(question.parameters()).toEqual([
        {
          type: "category",
          name: "foo",
          id: "foo_id",
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          value: "abc",
          fields: [
            expect.objectContaining({
              id: PRODUCTS.CATEGORY,
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
      expect(native_orders_count_question._convertParametersToMbql()).toBe(
        native_orders_count_question,
      );
    });

    it("should convert a question with parameters into a new question with filters", () => {
      const parameters = [
        {
          type: "string/starts-with",
          name: "foo",
          id: "foo_id",
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
        {
          type: "string/=",
          name: "bar",
          id: "bar_id",
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
      ];

      const question = base_question
        .setParameters(parameters)
        .setParameterValues({
          foo_id: "abc",
        });

      const questionWithFilters = question._convertParametersToMbql();

      expect(questionWithFilters.datasetQuery().query.filter).toEqual([
        "starts-with",
        ["field", PRODUCTS.CATEGORY, null],
        "abc",
        { "case-sensitive": false },
      ]);
    });
  });

  describe("getUrlWithParameters", () => {
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
      const question = new Question(card, metadata);

      it("should return question URL with no parameters", () => {
        const parameters = [];
        const parameterValues = {};

        const url = ML_Urls.getUrlWithParameters(
          question,
          parameters,
          parameterValues,
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: {},
          card: null,
        });
      });

      it("should return question URL with string MBQL filter added", () => {
        const url = ML_Urls.getUrlWithParameters(question, parameters, {
          1: "bar",
        });

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
        const url = ML_Urls.getUrlWithParameters(question, parameters, {
          5: 123,
        });

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
        const url = ML_Urls.getUrlWithParameters(question, parameters, {
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
        const url = ML_Urls.getUrlWithParameters(
          question,
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
      const question = new Question(card);

      it("should return a card with attached parameters and parameter values as query params", () => {
        const url = ML_Urls.getUrlWithParameters(question, parameters, {
          1: "bar",
        });

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
        const url = ML_Urls.getUrlWithParameters(
          question,
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

      const question = new Question(cardWithTextFilter, metadata);

      it("should return question URL when there are no parameters", () => {
        const url = ML_Urls.getUrlWithParameters(question, [], {});
        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: {},
          card: null,
        });
      });

      it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's variable", () => {
        const url = ML_Urls.getUrlWithParameters(
          question,
          parametersForNativeQ,
          {
            1: "bar",
          },
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question/1",
          query: { baz: "bar" },
          card: null,
        });
      });

      it("should return question URL with query string parameter when there is a value for a parameter mapped to the question's field filter", () => {
        const question = new Question(cardWithFieldFilter, metadata);
        const url = ML_Urls.getUrlWithParameters(
          question,
          parametersForNativeQ,
          {
            5: "111",
          },
        );

        expect(parseUrl(url)).toEqual({
          pathname: "/question/2",
          query: { bar: "111" },
          card: null,
        });
      });

      it("should not include objectId in a URL", () => {
        const url = ML_Urls.getUrlWithParameters(
          question,
          parametersForNativeQ,
          {
            1: "bar",
          },
        );
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
      expect(newQuestion._doNotCallSerializableCard().original_card_id).toBe(
        123,
      );
    });

    it("should return a question without a transient original_card_id", () => {
      const cardWithTransientId = {
        ...card,
        id: 123,
        original_card_id: "bar",
      };

      const question = new Question(cardWithTransientId, metadata);
      const newQuestion = question.omitTransientCardIds();
      expect(
        newQuestion._doNotCallSerializableCard().original_card_id,
      ).toBeUndefined();
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

  describe("Question.prototype.supportsImplicitActions", () => {
    it("should allow to create implicit actions for a raw model", () => {
      const question = new Question(orders_raw_card, metadata);
      expect(question.supportsImplicitActions()).toBeTruthy();
    });

    it("should not allow to create implicit actions for a model with aggregations", () => {
      const question = new Question(orders_count_card, metadata);
      expect(question.supportsImplicitActions()).toBeFalsy();
    });

    it("should not allow to create implicit actions for a model with filters", () => {
      const question = new Question(orders_filter_card, metadata);
      expect(question.supportsImplicitActions()).toBeFalsy();
    });

    it("should not allow to create implicit actions for a model with joins", () => {
      const question = new Question(orders_join_card, metadata);
      expect(question.supportsImplicitActions()).toBeFalsy();
    });

    it("should not allow to create implicit actions for a model with expressions", () => {
      const question = new Question(orders_expression_card, metadata);
      expect(question.supportsImplicitActions()).toBeFalsy();
    });

    it("should not allow to create implicit actions for a model with multiple stages", () => {
      const question = new Question(orders_multi_stage_card, metadata);
      expect(question.supportsImplicitActions()).toBeFalsy();
    });

    it("should allow to create implicit actions for a native model", () => {
      const question = new Question(native_orders_count_card, metadata);
      expect(question.supportsImplicitActions()).toBeFalsy();
    });
  });

  describe("Question.generateQueryDescription", () => {
    it("should work with multiple aggregations", () => {
      const question = base_question.setDatasetQuery({
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });
      expect(question.generateQueryDescription()).toEqual(
        "Orders, Count and Sum of Total",
      );
    });

    it("should work with named aggregations", () => {
      const question = base_question.setDatasetQuery({
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", 1, null]],
              { "display-name": "Revenue" },
            ],
          ],
        },
      });
      expect(question.generateQueryDescription()).toEqual("Orders, Revenue");
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
