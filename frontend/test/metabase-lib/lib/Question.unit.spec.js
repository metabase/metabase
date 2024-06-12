import { assoc, dissoc, assocIn } from "icepick";
import { parse } from "url";

import { createMockMetadata } from "__support__/metadata";
import { deserializeCardFromUrl } from "metabase/lib/card";
import Question from "metabase-lib/v1/Question";
import NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import * as ML_Urls from "metabase-lib/v1/urls";
import {
  createMockColumn,
  createMockDatasetData,
  createMockMetric,
} from "metabase-types/api/mocks";
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

const metadata_without_order_pk = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createProductsTable(),
        createPeopleTable(),
        createReviewsTable(),
        createOrdersTable({
          fields: [
            createOrdersIdField({ semantic_type: "type/Integer" }),
            createOrdersUserIdField(),
            createOrdersProductIdField(),
            createOrdersSubtotalField(),
            createOrdersTaxField(),
            createOrdersTotalField(),
            createOrdersDiscountField(),
            createOrdersCreatedAtField(),
            createOrdersQuantityField(),
          ],
        }),
      ],
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

const orders_card_without_pk = {
  id: 1,
  name: "Orders Model",
  display: "table",
  visualization_settings: {},
  can_write: true,
  type: "model",
  database_id: SAMPLE_DB_ID,
  table_id: ORDERS_ID,
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
  result_metadata: [
    createOrdersIdField({
      semantic_type: "type/Integer",
      field_ref: ["field", 11, null],
    }),
  ],
};

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
const ordersCountData = createMockDatasetData({
  cols: [
    createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/BigInteger",
      semantic_type: "type/Quantity",
      effective_type: "type/BigInteger",
    }),
  ],
  rows: [[1]],
});

const multipleRowsData = createMockDatasetData({
  cols: [
    createMockColumn({ display_name: "foo" }),
    createMockColumn({ display_name: "bar" }),
  ],
  rows: [
    [10, 20],
    [100, 200],
  ],
});

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
        expect(
          question.legacyQuery({ useStructuredQuery: true }).constructor,
        ).toBe(StructuredQuery);
        expect(
          question.legacyQuery({ useStructuredQuery: true }).constructor,
        ).toBe(StructuredQuery);
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
    describe("legacyQuery()", () => {
      it("returns a correct class instance for structured query", () => {
        // This is a bit wack, and the repetitive naming is pretty confusing.
        const query = orders_raw_question.legacyQuery({
          useStructuredQuery: true,
        });
        expect(query instanceof StructuredQuery).toBe(true);
      });
      it("returns a correct class instance for native query", () => {
        const query = native_orders_count_question.legacyQuery({
          useStructuredQuery: true,
        });
        expect(query instanceof NativeQuery).toBe(true);
      });
    });
    describe("setQuery(query)", () => {
      it("updates the dataset_query of card", () => {
        const rawQuery = native_orders_count_question.legacyQuery({
          useStructuredQuery: true,
        });
        const newRawQuestion = orders_raw_question.setLegacyQuery(rawQuery);
        expect(
          newRawQuestion.legacyQuery({ useStructuredQuery: true }) instanceof
            NativeQuery,
        ).toBe(true);
      });
    });
    describe("setDatasetQuery(datasetQuery)", () => {
      it("updates the dataset_query of card", () => {
        const rawQuestion = orders_raw_question.setDatasetQuery(
          native_orders_count_question.datasetQuery(),
        );

        expect(
          rawQuestion.legacyQuery({ useStructuredQuery: true }) instanceof
            NativeQuery,
        ).toBe(true);
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
        const tableQuestion = orders_raw_question.setDisplay("table");
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

      it("should not set the display to scalar if table was selected and display is locked", () => {
        const question = orders_count_question
          .setDisplay("table")
          .lockDisplay()
          .maybeResetDisplay(ordersCountData, ["table", "scalar"]);

        expect(question.display()).toBe("table");
      });

      it("should set the display to scalar if a non-scalar was selected and display is locked", () => {
        const question = base_question
          .setDisplay("table")
          .maybeResetDisplay(ordersCountData, ["table", "scalar"]);

        expect(question.display()).toBe("scalar");
      });

      it("should not set the display to scalar if another scalar display was selected and display is locked", () => {
        const question = base_question
          .setDisplay("gauge")
          .maybeResetDisplay(ordersCountData, ["table", "scalar", "gauge"]);

        expect(question.display()).toBe("gauge");
      });

      it("switch to table view if we had a scalar and now have more than 1x1 data", () => {
        const question = base_question
          .setDisplay("scalar")
          .maybeResetDisplay(multipleRowsData, ["table"]);

        expect(question.display()).toBe("table");
      });

      it("should set the display to scalar if funnel was selected", () => {
        const question = orders_count_question
          .setDisplay("funnel")
          .lockDisplay()
          .maybeResetDisplay(ordersCountData, ["table", "scalar"]);

        expect(question.display()).toBe("scalar");
      });
    });

    describe("maybeResetDisplay", () => {
      it("should do nothing when it was locked with sensible display", () => {
        const sensibleDisplays = ["table", "scalar"];
        const previousSensibleDisplays = sensibleDisplays;
        const question = new Question(orders_count_card, metadata)
          .setDisplay("scalar")
          .lockDisplay()
          .maybeResetDisplay(
            ordersCountData,
            sensibleDisplays,
            previousSensibleDisplays,
          );

        expect(question.displayIsLocked()).toBe(true);
        expect(question.display()).toBe("scalar");
      });

      it("should do nothing when it was locked with nonsense display", () => {
        const sensibleDisplays = ["table", "scalar"];
        const previousSensibleDisplays = sensibleDisplays;
        const question = new Question(orders_count_card, metadata)
          .setDisplay("funnel")
          .lockDisplay()
          .maybeResetDisplay(
            ordersCountData,
            sensibleDisplays,
            previousSensibleDisplays,
          );

        expect(question.displayIsLocked()).toBe(true);
        expect(question.display()).toBe("funnel");
      });

      it("should use default display when nonsense display is used and was not locked", () => {
        const sensibleDisplays = ["table", "scalar"];
        const question = base_question
          .setDisplay("funnel")
          .maybeResetDisplay(
            multipleRowsData,
            sensibleDisplays,
            sensibleDisplays,
          );

        expect(question.display()).not.toBe("funnel");
        expect(question.display()).toBe("table");
      });

      it("should unlock and use new sensible display when it was locked with sensible display which has become not sensible", () => {
        const previousSensibleDisplays = ["funnel"];
        const sensibleDisplays = ["table", "scalar"];
        const question = orders_count_question
          .setDisplay("funnel")
          .lockDisplay()
          .maybeResetDisplay(
            ordersCountData,
            sensibleDisplays,
            previousSensibleDisplays,
          );

        expect(question.displayIsLocked()).toBe(false);
        expect(question.display()).not.toBe("funnel");
        expect(sensibleDisplays).toContain(question.display());
      });

      it("should keep any sensible display when display was locked", () => {
        const sensibleDisplays = ["table", "scalar"];
        const question = base_question
          .setDisplay("scalar")
          .lockDisplay()
          .maybeResetDisplay(multipleRowsData, sensibleDisplays);

        expect(question.display()).not.toBe("table");
        expect(question.display()).toBe("scalar");
      });

      it("should keep any sensible display when display was not locked (metabase#32075)", () => {
        const sensibleDisplays = ["table", "scalar"];
        const question = base_question
          .setDisplay("scalar")
          .maybeResetDisplay(multipleRowsData, sensibleDisplays);

        expect(question.display()).not.toBe("table");
        expect(question.display()).toBe("scalar");
      });

      it("should switch to scalar display for 1x1 data", () => {
        const sensibleDisplays = ["table", "scalar"];
        const question = orders_count_question
          .setDisplay("table")
          .maybeResetDisplay(ordersCountData, sensibleDisplays);

        expect(question.display()).not.toBe("table");
        expect(question.display()).toBe("scalar");
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
        const underlyingDataQuestion = orders_count_question.setSettings({
          "table.pivot": false,
        });
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
                value: null,
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
          value: null,
        },
        {
          default: undefined,
          hasVariableTemplateTagTarget: true,
          id: "aaa",
          name: "Bar",
          slug: "bar",
          target: ["variable", ["template-tag", "bar"]],
          type: "category",
          value: null,
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
          value: null,
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
        [
          "field",
          PRODUCTS.CATEGORY,
          {
            "base-type": "type/Text",
            "source-field": ORDERS.PRODUCT_ID,
          },
        ],
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
            ["=", ["field", 1, { "base-type": "type/Text" }], "bar"],
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
              ["=", ["field", 2, { "base-type": "type/Float" }], 123],
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
              [
                "=",
                [
                  "field",
                  3,
                  { "base-type": "type/BigInteger", "temporal-unit": "month" },
                ],
                "2017-05-01",
              ],
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
            param_date: "",
            param_fk: "",
            param_number: "",
            param_operator: "",
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

    it("should allow to create implicit actions where the underlying table has a primary key but the model does not", () => {
      const orders_question_without_pk = new Question(
        orders_card_without_pk,
        metadata,
      );
      expect(orders_question_without_pk.supportsImplicitActions()).toBeTruthy();
    });

    it("should not allow to create implicit actions where the underlying table has no primary key", () => {
      const question = new Question(orders_raw_card, metadata_without_order_pk);
      expect(question.supportsImplicitActions()).toBeFalsy();
    });

    it("should not allow to create implicit actions where the model has a primary key, but the underlying table does not", () => {
      const question = new Question(
        orders_card_without_pk,
        metadata_without_order_pk,
      );
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
