import _ from "underscore";
import { getStructuredQueryTable } from "./structured-query-table";
import {
  metadata,
  PRODUCTS,
  ORDERS,
  SAMPLE_DATABASE,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/lib/Question";
import Field from "metabase-lib/lib/metadata/Field";

import StructuredQuery from "../StructuredQuery";

describe("metabase-lib/queries/utils/structured-query-table", () => {
  describe("Card that relies on another card as its source table", () => {
    const NESTED_CARD_QUESTION = new Question(
      {
        dataset_query: {
          database: SAMPLE_DATABASE?.id,
          query: {
            "source-table": "card__1",
          },
          type: "query",
        },
        id: 2,
        display: "table",
        database_id: SAMPLE_DATABASE?.id,
        table_id: PRODUCTS.id,
        name: "Question based on another question",
      },
      metadata,
    );

    const BASE_QUESTION = new Question(
      {
        ...PRODUCTS.newQuestion().card(),
        id: 1,
        display: "table",
        database_id: SAMPLE_DATABASE?.id,
        table_id: PRODUCTS.id,
        name: "Base question",
        result_metadata: [
          {
            name: "boolean",
            display_name: "boolean",
            base_type: "type/Boolean",
            effective_type: "type/Boolean",
            semantic_type: null,
            field_ref: [
              "field",
              "boolean",
              {
                "base-type": "type/Boolean",
              },
            ],
          },
          {
            base_type: "type/Text",
            display_name: "Foo",
            effective_type: "type/Text",
            field_ref: ["expression", "Foo"],
            id: ["field", "Foo", { "base-type": "type/Text" }],
            name: "Foo",
            semantic_type: null,
            table_id: "card__1",
          },
          {
            id: PRODUCTS.CATEGORY.id,
            display_name: "~*~ Category ~*~",
          },
        ],
      },
      metadata,
    );

    metadata.questions = {
      [NESTED_CARD_QUESTION.id()]: NESTED_CARD_QUESTION,
      [BASE_QUESTION.id()]: BASE_QUESTION,
    };

    const table = getStructuredQueryTable(
      NESTED_CARD_QUESTION.query() as StructuredQuery,
    );
    it("should return a virtual table based on the nested card", () => {
      expect(table.getPlainObject()).toEqual({
        display_name: "Base question",
        id: "card__1",
        name: "Base question",
      });
    });

    it("should contain fields created by merging the underlying concrete table fields with field metadata found on the card object", () => {
      expect(table.fields.map(field => field.getPlainObject())).toEqual([
        {
          base_type: "type/Boolean",
          display_name: "boolean",
          effective_type: "type/Boolean",
          field_ref: [
            "field",
            "boolean",
            {
              "base-type": "type/Boolean",
            },
          ],
          name: "boolean",
          semantic_type: null,
          source: "fields",
        },
        {
          base_type: "type/Text",
          display_name: "Foo",
          effective_type: "type/Text",
          field_ref: ["expression", "Foo"],
          id: [
            "field",
            "Foo",
            {
              "base-type": "type/Text",
            },
          ],
          name: "Foo",
          semantic_type: null,
          source: "fields",
          table_id: "card__1",
        },
        {
          ...PRODUCTS.CATEGORY.getPlainObject(),
          description:
            "The type of product, valid values include: Doohickey, Gadget, Gizmo and Widget",
          display_name: "~*~ Category ~*~",
        },
      ]);
    });
  });

  describe("Dataset/model card", () => {
    const ORDERS_USER_ID_FIELD = metadata
      .field(ORDERS.USER_ID.id)
      .getPlainObject();
    const OVERWRITTEN_USER_ID_FIELD_METADATA = {
      ...ORDERS_USER_ID_FIELD,
      display_name: "Foo",
      description: "Bar",
      fk_target_field_id: 1,
      semantic_type: "type/Price",
      settings: {
        show_mini_bar: true,
      },
    };

    const ORDERS_DATASET = ORDERS.question()
      .setDataset(true)
      .setDisplayName("Dataset Question")
      .setResultsMetadata({
        columns: [OVERWRITTEN_USER_ID_FIELD_METADATA],
      });
    ORDERS_DATASET.card().id = 3;

    metadata.questions = {
      [ORDERS_DATASET.id()]: ORDERS_DATASET,
    };

    const table = getStructuredQueryTable(ORDERS_DATASET.query());
    it("should return a virtual table using the given query's question", () => {
      expect(table.getPlainObject()).toEqual({
        display_name: "Dataset Question",
        id: "card__3",
        name: "Dataset Question",
      });
    });

    it("should contain fields created by merging the underlying concrete table fields with field metadata found on the dataset card object", () => {
      expect(table.fields.map(field => field.getPlainObject())).toEqual([
        OVERWRITTEN_USER_ID_FIELD_METADATA,
      ]);
    });
  });

  describe("Card that relies on a source query", () => {
    const SOURCE_QUERY_QUESTION = new Question(
      {
        dataset_query: {
          database: SAMPLE_DATABASE?.id,
          query: { "source-query": { "source-table": PRODUCTS.id } },
          type: "query",
        },
        id: 2,
        display: "table",
        database_id: SAMPLE_DATABASE?.id,
        table_id: PRODUCTS.id,
        name: "Question using a nested query",
      },
      metadata,
    );

    metadata.questions = {
      [SOURCE_QUERY_QUESTION.id()]: SOURCE_QUERY_QUESTION,
    };

    const table = getStructuredQueryTable(
      SOURCE_QUERY_QUESTION.query() as StructuredQuery,
    );

    it("should return a virtual table based on the nested query", () => {
      expect(table.getPlainObject()).toEqual({
        display_name: "",
        id: 3,
        name: "",
      });
    });

    it("should contain fields", () => {
      const fields = _.sortBy(
        table.fields.map(field => field.getPlainObject()),
        "name",
      );
      const nestedQueryProductFields = _.sortBy(
        PRODUCTS.fields.map((field: Field) => {
          const column = field.dimension().column();
          return {
            ...column,
            id: ["field", column.name, { "base-type": column.base_type }],
            source: "fields",
          };
        }),
        "name",
      );

      expect(fields).toEqual(nestedQueryProductFields);
    });
  });

  describe("Card that has a concrete source table", () => {
    const table = getStructuredQueryTable(
      ORDERS.newQuestion().query() as StructuredQuery,
    );

    it("should return the concrete table stored on the Metadata object", () => {
      expect(table).toBe(ORDERS);
    });
  });
});
