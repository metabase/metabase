// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import _ from "underscore";
import { createMockMetadata } from "__support__/metadata";
import {
  createMockField,
  createMockSavedQuestionsDatabase,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createSavedStructuredCard,
  createStructuredModelCard,
  createProductsIdField,
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import type Question from "metabase-lib/Question";
import Table from "metabase-lib/metadata/Table";
import type Field from "metabase-lib/metadata/Field";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";

import type StructuredQuery from "../StructuredQuery";
import { getStructuredQueryTable } from "./structured-query-table";

const SAVED_QUESTIONS_DB = createMockSavedQuestionsDatabase();

const modelField = createMockField({
  ...createProductsIdField(),
  display_name: "~*~Products.ID~*~",
});

const modelCard = createStructuredModelCard({
  id: 1,
  name: "Structured Model",
  result_metadata: [modelField],
});
const modelTable = createMockTable({
  id: getQuestionVirtualTableId(modelCard.id),
  db_id: SAVED_QUESTIONS_DB.id,
  name: modelCard.name,
  display_name: modelCard.name,
  fields: [modelField],
});

const card = createSavedStructuredCard({ id: 2, name: "Base question" });
const cardTable = createMockTable({
  id: getQuestionVirtualTableId(card.id),
  db_id: SAVED_QUESTIONS_DB.id,
  name: card.name,
  display_name: card.name,
  fields: [createMockField({ table_id: getQuestionVirtualTableId(card.id) })],
});

const nestedCard = createSavedStructuredCard({
  id: 3,
  name: "Question based on another question",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: createMockStructuredQuery({
      "source-table": getQuestionVirtualTableId(card.id),
    }),
  }),
});

const sourceQueryCard = createSavedStructuredCard({
  id: 4,
  name: "Question based on a source query",
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: createMockStructuredQuery({
      "source-query": {
        "source-table": PRODUCTS_ID,
      },
    }),
  }),
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase(), SAVED_QUESTIONS_DB],
  tables: [cardTable, modelTable],
  questions: [card, nestedCard, modelCard, sourceQueryCard],
});

describe("metabase-lib/queries/utils/structured-query-table", () => {
  describe("Card that relies on another card as its source table", () => {
    const nestedQuestion = metadata.question(nestedCard.id) as Question;
    const virtualTable = metadata.table(cardTable.id) as Table;

    const table = getStructuredQueryTable(
      nestedQuestion.query() as StructuredQuery,
    );

    it("should return a table", () => {
      expect(table).toBeInstanceOf(Table);
    });

    it("should return a virtual table based on the nested card", () => {
      expect(table?.getPlainObject()).toEqual(virtualTable.getPlainObject());
      expect(table?.fields).toEqual(virtualTable.fields);
    });
  });

  describe("Model card", () => {
    const model = metadata.question(modelCard.id) as Question;

    const table = getStructuredQueryTable(model.query() as StructuredQuery);

    it("should return a nested card table using the given query's question", () => {
      expect(table?.getPlainObject()).toEqual(
        expect.objectContaining({
          id: modelTable.id,
          name: modelTable.name,
          display_name: modelTable.display_name,
        }),
      );

      const [field] = table?.fields || [];
      expect(field.getPlainObject()).toEqual(
        expect.objectContaining({
          ...modelField,
          display_name: "~*~Products.ID~*~",
        }),
      );
    });
  });

  describe("Card that relies on a source query", () => {
    const sourceQueryQuestion = metadata.question(
      sourceQueryCard.id,
    ) as Question;
    const productsTable = metadata.table(PRODUCTS_ID) as Table;

    const table = getStructuredQueryTable(
      sourceQueryQuestion.query() as StructuredQuery,
    );

    it("should return a virtual table based on the nested query", () => {
      expect(table?.getPlainObject()).toEqual({
        id: PRODUCTS_ID,
        db_id: SAMPLE_DB_ID,
        name: "",
        display_name: "",
        schema: "",
        description: null,
        active: true,
        visibility_type: null,
        field_order: "database",
        initial_sync_status: "complete",
      });
    });

    it("should contain fields", () => {
      const fields = _.sortBy(
        (table?.fields || []).map(field => field.getPlainObject()),
        "name",
      );

      const nestedQueryProductFields = _.sortBy(
        productsTable.fields.map((field: Field) => {
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
    const ordersTable = metadata.table(ORDERS_ID) as Table;

    const table = getStructuredQueryTable(
      ordersTable.query() as StructuredQuery,
    );

    it("should return the concrete table stored on the Metadata object", () => {
      expect(table).toBe(ordersTable);
    });
  });
});
