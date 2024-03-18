import { createMockMetadata } from "__support__/metadata";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import {
  createMockField,
  createMockNativeDatasetQuery,
  createMockTable,
  createMockSavedQuestionsDatabase,
} from "metabase-types/api/mocks";
import {
  createNativeModelCard,
  createProductsIdField,
  createSampleDatabase,
  createSavedNativeCard,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

import { getNativeQueryTable } from "./native-query-table";

const MODEL_ID = 1;
const MODEL_VIRTUAL_TABLE_ID = getQuestionVirtualTableId(MODEL_ID);

const SAVED_QUESTIONS_DB = createMockSavedQuestionsDatabase();

const modelField = createMockField({
  ...createProductsIdField(),
  display_name: "~*~Products.ID~*~",
});

const model = createNativeModelCard({
  id: 1,
  name: "Native Model Question",
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
    native: {
      query: "select * from ORDERS",
    },
  }),
  result_metadata: [modelField],
});

const modelTable = createMockTable({
  id: MODEL_VIRTUAL_TABLE_ID,
  db_id: SAVED_QUESTIONS_DB.id,
  name: model.name,
  display_name: model.name,
  fields: [modelField],
});

const cardWithCollection = createSavedNativeCard({
  id: 2,
  dataset_query: createMockNativeDatasetQuery({
    database: SAMPLE_DB_ID,
    native: {
      query: "select * from ORDERS",
      collection: "PRODUCTS",
    },
  }),
});

const card = createSavedNativeCard({ id: 3 });

const metadata = createMockMetadata({
  databases: [createSampleDatabase(), SAVED_QUESTIONS_DB],
  tables: [modelTable],
  questions: [model, card, cardWithCollection],
});

describe("metabase-lib/v1/queries/utils/native-query-table", () => {
  describe("native query associated with a model", () => {
    const virtualTable = metadata.table(MODEL_VIRTUAL_TABLE_ID) as Table;

    it("should return a nested card table using the given query's question", () => {
      expect(virtualTable.getPlainObject()).toEqual(
        expect.objectContaining({
          id: "card__1",
          name: "Native Model Question",
          display_name: "Native Model Question",
        }),
      );

      const [field] = virtualTable.getFields();
      expect(field.getPlainObject()).toEqual(
        expect.objectContaining({
          ...modelField,
          display_name: "~*~Products.ID~*~",
        }),
      );
    });
  });

  describe("native query associated with both a `collection` and a `database`", () => {
    const productsTable = metadata.table(PRODUCTS_ID) as Table;
    const nativeQuestionWithCollection = metadata.question(
      cardWithCollection.id,
    ) as Question;

    const table = getNativeQueryTable(
      nativeQuestionWithCollection.legacyQuery() as NativeQuery,
    );

    it("should return the concrete `table` associated with the given collection name", () => {
      expect(table).toBe(productsTable);
    });
  });

  describe("basic native query question", () => {
    const nativeQuestion = metadata.question(card.id) as Question;
    const table = getNativeQueryTable(
      nativeQuestion.legacyQuery() as NativeQuery,
    );

    it("should not return a table", () => {
      expect(table).toBeNull();
    });
  });
});
