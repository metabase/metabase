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

describe("shouldRenderQueryBuilderEditingControl", () => {
  it("returns false when there is no question", () => {
    expect(shouldRenderQueryBuilderEditingControl(undefined)).toBe(false);
  });

  it("returns true for an editable, non-native, non-archived question", () => {
    const editableQuery = Lib.createTestQuery(
      SAMPLE_PROVIDER,
      DEFAULT_TEST_QUERY,
    );
    const editableQuestion = Question.create({
      metadata: SAMPLE_METADATA,
    }).setQuery(editableQuery);

    expect(shouldRenderQueryBuilderEditingControl(editableQuestion)).toBe(true);
  });

  it("returns false when missing create-queries permission (isEditable: false)", () => {
    // Mirrors the backend: create a query without create-queries permission.
    const sampleDatabase = createSampleDatabase();
    const databaseWithoutOrders = {
      ...sampleDatabase,
      tables: sampleDatabase.tables?.filter((table) => table.id !== ORDERS_ID),
    };
    const metadataWithoutOrders = createMockMetadata({
      databases: [databaseWithoutOrders],
    });
    const notEditableQuery = Lib.fromJsQueryAndMetadata(metadataWithoutOrders, {
      database: databaseWithoutOrders.id,
      type: "query",
      query: { "source-table": ORDERS_ID },
    });
    const notEditableQuestion = Question.create({
      metadata: metadataWithoutOrders,
    }).setQuery(notEditableQuery);

    expect(shouldRenderQueryBuilderEditingControl(notEditableQuestion)).toBe(
      false,
    );
  });

  it("returns false for a native query, even when editable", () => {
    const nativeQuestion = Question.create({
      metadata: SAMPLE_METADATA,
      DEPRECATED_RAW_MBQL_type: "native",
      DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DATABASE.id,
    });

    expect(shouldRenderQueryBuilderEditingControl(nativeQuestion)).toBe(false);
  });

  it("returns false for an archived question", () => {
    const editableQuery = Lib.createTestQuery(
      SAMPLE_PROVIDER,
      DEFAULT_TEST_QUERY,
    );
    const editableQuestion = Question.create({
      metadata: SAMPLE_METADATA,
    }).setQuery(editableQuery);
    const archivedQuestion = editableQuestion.setCard({
      ...editableQuestion.card(),
      archived: true,
    });

    expect(shouldRenderQueryBuilderEditingControl(archivedQuestion)).toBe(
      false,
    );
  });
});
