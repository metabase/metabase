import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { shouldRenderQueryBuilderEditingControl } from "./should-render-query-builder-editing-control";

const editableQuery = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
const EDITABLE_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
}).setQuery(editableQuery);

const ARCHIVED_QUESTION = EDITABLE_QUESTION.setCard({
  ...EDITABLE_QUESTION.card(),
  archived: true,
});

const NATIVE_QUESTION = Question.create({
  metadata: SAMPLE_METADATA,
  DEPRECATED_RAW_MBQL_type: "native",
  DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DATABASE.id,
});

// Mirrors what the backend does when create-queries permission is missing: `mi/can-read?`
// on :model/Table requires create-queries, so the Orders table is excluded from metadata
// entirely, which makes editable-stages? fall through to isEditable: false instead of
// throwing (see src/metabase/warehouse_schema/models/table.clj).
const sampleDatabase = createSampleDatabase();
const databaseWithoutOrders = {
  ...sampleDatabase,
  tables: sampleDatabase.tables?.filter((table) => table.id !== ORDERS_ID),
};
const METADATA_WITHOUT_ORDERS = createMockMetadata({
  databases: [databaseWithoutOrders],
});
const notEditableQuery = Lib.fromJsQueryAndMetadata(METADATA_WITHOUT_ORDERS, {
  database: databaseWithoutOrders.id,
  type: "query",
  query: { "source-table": ORDERS_ID },
});
const NOT_EDITABLE_QUESTION = Question.create({
  metadata: METADATA_WITHOUT_ORDERS,
}).setQuery(notEditableQuery);

describe("shouldRenderQueryBuilderEditingControl", () => {
  it("returns false when there is no question", () => {
    expect(shouldRenderQueryBuilderEditingControl(undefined)).toBe(false);
  });

  it("returns true for an editable, non-native, non-archived question", () => {
    expect(shouldRenderQueryBuilderEditingControl(EDITABLE_QUESTION)).toBe(
      true,
    );
  });

  it("returns false when missing create-queries permission (isEditable: false)", () => {
    expect(shouldRenderQueryBuilderEditingControl(NOT_EDITABLE_QUESTION)).toBe(
      false,
    );
  });

  it("returns false for a native query, even when editable", () => {
    expect(shouldRenderQueryBuilderEditingControl(NATIVE_QUESTION)).toBe(false);
  });

  it("returns false for an archived question", () => {
    expect(shouldRenderQueryBuilderEditingControl(ARCHIVED_QUESTION)).toBe(
      false,
    );
  });
});
