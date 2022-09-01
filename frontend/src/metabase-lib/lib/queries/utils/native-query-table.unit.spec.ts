import { merge } from "icepick";

import {
  metadata,
  PRODUCTS,
  SAMPLE_DATABASE,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/lib/Question";
import Table from "metabase-lib/lib/metadata/Table";
import type NativeQuery from "metabase-lib/lib/queries/NativeQuery";

import { getNativeQueryTable } from "./native-query-table";

const NATIVE_QUERY_CARD = {
  id: 1,
  dataset_query: {
    database: SAMPLE_DATABASE?.id,
    type: "native",
    native: {
      query: "select * from ORDERS where CREATED_AT = {{created}}",
    },
  },
};

describe("metabase-lib/queries/utils/native-query-table", () => {
  describe("native query associated with a dataset/model question", () => {
    const PRODUCT_ID_WITH_OVERRIDING_METADATA = {
      ...PRODUCTS.ID.getPlainObject(),
      display_name: "~*~Products.ID~*~",
    };

    const nativeDatasetQuestion = new Question(NATIVE_QUERY_CARD, metadata)
      .setDataset(true)
      .setDisplayName("Native Dataset Question")
      .setResultsMetadata({
        columns: [PRODUCT_ID_WITH_OVERRIDING_METADATA],
      });

    const nestedNativeDatasetTable = new Table({
      id: "card__1",
      display_name: nativeDatasetQuestion.displayName(),
      name: nativeDatasetQuestion.displayName(),
    });
    // Note that this SHOULD be identical to PRODUCT_ID_WITH_OVERRIDING_METADATA
    // but this mimics the bug metabase#25141
    nestedNativeDatasetTable.fields = [PRODUCTS.ID];

    metadata.questions = {
      [nativeDatasetQuestion.id()]: nativeDatasetQuestion,
    };
    metadata.tables[nestedNativeDatasetTable.id] = nestedNativeDatasetTable;

    const table = getNativeQueryTable(
      nativeDatasetQuestion.query() as NativeQuery,
    );

    it("should return a virtual table using the given query's question", () => {
      expect(table?.getPlainObject()).toEqual({
        display_name: "Native Dataset Question",
        id: "card__1",
        name: "Native Dataset Question",
        fields: [PRODUCTS.ID.id],
      });
    });

    it("should contain fields created by merging the underlying concrete table fields with field metadata found on the dataset card object", () => {
      expect(table?.fields.map(field => field.getPlainObject())).toEqual([
        {
          ...PRODUCT_ID_WITH_OVERRIDING_METADATA,
          source: "nested",
        },
      ]);
    });
  });

  describe("native query associated with botha `collection` and a `database`", () => {
    const nativeQuestionWithCollection = new Question(
      merge(NATIVE_QUERY_CARD, {
        dataset_query: {
          native: {
            collection: PRODUCTS.name,
          },
        },
      }),
      metadata,
    );

    const table = getNativeQueryTable(
      nativeQuestionWithCollection.query() as NativeQuery,
    );

    it("should return the concrete `table` associated with the given collection name", () => {
      expect(table).toBe(PRODUCTS);
    });
  });

  describe("basic native query question", () => {
    const nativeQuestion = new Question(NATIVE_QUERY_CARD, metadata);
    const table = getNativeQueryTable(nativeQuestion.query() as NativeQuery);

    it("should not return a table", () => {
      expect(table).toBeNull();
    });
  });
});
