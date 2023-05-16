// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";

import {
  metadata,
  PRODUCTS,
  ORDERS,
  SAMPLE_DATABASE,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/Question";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";

import type StructuredQuery from "../StructuredQuery";
import { getStructuredQueryTable } from "./structured-query-table";

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
      },
      metadata,
    );

    const NESTED_CARD_TABLE = new Table({
      id: "card__1",
      display_name: BASE_QUESTION.displayName(),
      name: BASE_QUESTION.displayName(),
    });
    NESTED_CARD_TABLE.fields = [
      new Field({
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
      }),
      new Field({
        base_type: "type/Text",
        display_name: "Foo",
        effective_type: "type/Text",
        field_ref: ["expression", "Foo"],
        id: ["field", "Foo", { "base-type": "type/Text" }],
        name: "Foo",
        semantic_type: null,
        table_id: "card__1",
      }),
      new Field({
        id: PRODUCTS.CATEGORY.id,
        display_name: "~*~ Category ~*~",
      }),
    ];

    metadata.questions = {
      [NESTED_CARD_QUESTION.id()]: NESTED_CARD_QUESTION,
      [BASE_QUESTION.id()]: BASE_QUESTION,
    };

    metadata.tables[NESTED_CARD_TABLE.id] = NESTED_CARD_TABLE;

    const table = getStructuredQueryTable(
      NESTED_CARD_QUESTION.query() as StructuredQuery,
    );

    it("should return a table", () => {
      expect(table).toBeInstanceOf(Table);
    });

    it("should return a virtual table based on the nested card", () => {
      expect(table?.getPlainObject()).toEqual(
        NESTED_CARD_TABLE.getPlainObject(),
      );
      expect(table?.fields).toEqual(NESTED_CARD_TABLE.fields);
    });
  });

  describe("Dataset/model card", () => {
    const ORDERS_USER_ID_FIELD = metadata
      .field(ORDERS.USER_ID.id)
      ?.getPlainObject();
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
      .setCard({ ...ORDERS.question().card(), id: 3 })
      .setDataset(true)
      .setDisplayName("Dataset Question");

    const ORDERS_DATASET_TABLE = new Table({
      id: "card__3",
      display_name: ORDERS_DATASET.displayName(),
      name: ORDERS_DATASET.displayName(),
      fields: [new Field(OVERWRITTEN_USER_ID_FIELD_METADATA)],
    });

    metadata.questions = {
      [ORDERS_DATASET.id()]: ORDERS_DATASET,
    };

    metadata.tables[ORDERS_DATASET_TABLE.id] = ORDERS_DATASET_TABLE;

    const table = getStructuredQueryTable(
      ORDERS_DATASET.query() as StructuredQuery,
    );
    it("should return a nested card table using the given query's question", () => {
      expect(table?.getPlainObject()).toEqual(
        expect.objectContaining({
          display_name: "Dataset Question",
          id: "card__3",
          name: "Dataset Question",
        }),
      );

      expect(table?.fields.map(field => field.getPlainObject())).toEqual([
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
      expect(table?.getPlainObject()).toEqual({
        id: 3,
        display_name: "",
        name: "",
      });
    });

    it("should contain fields", () => {
      const fields = _.sortBy(
        (table?.fields as Field[]).map(field => field.getPlainObject()),
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
