import { createMockMetadata } from "__support__/metadata";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { createMockNativeDatasetQuery } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
  createSavedNativeCard,
} from "metabase-types/api/mocks/presets";

import { getNativeQueryTable } from "./native-query-table";

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
  databases: [
    createSampleDatabase({
      features: ["native-requires-specified-collection"],
    }),
  ],
  questions: [card, cardWithCollection],
});

describe("metabase-lib/v1/queries/utils/native-query-table", () => {
  describe("native query associated with both a `collection` and a `database`", () => {
    // Unjustified type cast. FIXME
    const productsTable = metadata.table(PRODUCTS_ID) as Table;
    // Unjustified type cast. FIXME
    const nativeQuestionWithCollection = metadata.question(
      cardWithCollection.id,
    ) as Question;

    const table = getNativeQueryTable(
      // Unjustified type cast. FIXME
      nativeQuestionWithCollection.legacyNativeQuery() as NativeQuery,
    );

    it("should return the concrete `table` associated with the given collection name", () => {
      expect(table).toBe(productsTable);
    });
  });

  describe("basic native query question", () => {
    // Unjustified type cast. FIXME
    const nativeQuestion = metadata.question(card.id) as Question;
    const table = getNativeQueryTable(
      // Unjustified type cast. FIXME
      nativeQuestion.legacyNativeQuery() as NativeQuery,
    );

    it("should not return a table", () => {
      expect(table).toBeNull();
    });
  });
});
