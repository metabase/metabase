import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { createMockCard } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getNativeQueryTable } from "./native-query-table";

const database = createSampleDatabase({
  features: ["native-requires-specified-collection"],
});

const provider = createMetadataProvider({
  metadata: createMockMetadata({ databases: [database] }),
});

const cardWithCollection = createMockCard({
  id: 2,
  query_type: "native",
  dataset_query: Lib.toJsQuery(
    Lib.withNativeExtras(
      Lib.createTestNativeQuery(provider, { query: "select * from ORDERS" }),
      { collection: "PRODUCTS" },
    ),
  ),
});

const card = createMockCard({
  id: 3,
  query_type: "native",
  dataset_query: Lib.createTestJsNativeQuery(provider, {
    query: "select * from ORDERS",
  }),
});

const metadata = createMockMetadata({
  databases: [database],
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
