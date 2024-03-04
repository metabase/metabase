import { screen } from "@testing-library/react";
import _ from "underscore";

import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

const { NativeQueryEditor } = jest.requireActual(
  "metabase/query_builder/components/NativeQueryEditor",
);

const TEST_DB = createSampleDatabase();

const TEST_NATIVE_CARD = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    type: "native",
    database: TEST_DB.id,
    native: {
      query: "select * from orders",
      "template-tags": undefined,
    },
  }),
});

const ROOT_COLLECTION = createMockCollection({ id: "root" });

interface SetupOpts {
  card?: Card;
  height?: number;
  isActive: boolean;
  readOnly?: boolean;
}

const setup = async ({
  card = TEST_NATIVE_CARD,
  height = 300,
  isActive,
  readOnly = false,
}: SetupOpts) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const metadata = getMetadata(storeInitialState);
  const question = checkNotNull(metadata.question(card.id));
  const query = question.legacyQuery({ useStructuredQuery: true });
  const DatasetQueryEditor = await importDatasetQueryEditor();
  const onSetDatabaseId = jest.fn();

  const { rerender } = renderWithProviders(
    <DatasetQueryEditor
      isActive={isActive}
      height={height}
      query={query}
      question={question}
      readOnly={readOnly}
      onResizeStop={_.noop}
      onSetDatabaseId={onSetDatabaseId}
    />,
  );

  return { query, question, rerender };
};

/**
 * NativeQueryEditor is globally mocked in test/register-visualizations.js but
 * its actual implementation is needed in this test suite because we need to
 * investigate its children.
 *
 * We're actually testing NativeQueryEditor indirectly by using DatasetQueryEditor
 * (which uses NativeQueryEditor), so the NativeQueryEditor has to be unmocked
 * the moment we import DatasetQueryEditor.
 *
 * Unmocking happens in beforeEach, so we can really only import the component
 * during the unit test.
 *
 * Should the import be at the beginning of this file, the mock NativeQueryEditor
 * would have been used in tests instead of the actual implementation.
 */
const importDatasetQueryEditor = async () => {
  const { default: DatasetQueryEditor } = await import(
    "metabase/query_builder/components/DatasetEditor/DatasetQueryEditor"
  );
  return DatasetQueryEditor;
};

describe("DatasetQueryEditor", () => {
  beforeEach(() => {
    jest.unmock("metabase/query_builder/components/NativeQueryEditor");

    jest
      .spyOn(NativeQueryEditor.prototype, "loadAceEditor")
      .mockImplementation(_.noop);
  });

  it("renders sidebar when query tab is active", async () => {
    await setup({ isActive: true });

    expect(
      screen.getByTestId("native-query-editor-sidebar"),
    ).toBeInTheDocument();
  });

  it("shows the native query editor container when query tab is active", async () => {
    await setup({ isActive: true });

    expect(screen.getByTestId("native-query-editor-container")).toBeVisible();
  });

  it("does not render sidebar when query tab is inactive", async () => {
    await setup({ isActive: false });

    expect(
      screen.queryByTestId("native-query-editor-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("hides the native query editor container when query tab is inactive", async () => {
    await setup({ isActive: false });

    expect(
      screen.getByTestId("native-query-editor-container"),
    ).not.toBeVisible();
  });

  it("re-renders DatasetQueryEditor when height is 0 and isActive prop changes", async () => {
    const { query, question, rerender } = await setup({
      height: 0,
      isActive: true,
    });
    const DatasetQueryEditor = await importDatasetQueryEditor();
    const onSetDatabaseId = jest.fn();

    expect(
      screen.getByTestId("native-query-editor-sidebar"),
    ).toBeInTheDocument();

    rerender(
      <DatasetQueryEditor
        isActive={false}
        height={0}
        query={query}
        question={question}
        readOnly={false}
        onResizeStop={_.noop}
        onSetDatabaseId={onSetDatabaseId}
      />,
    );

    expect(
      screen.queryByTestId("native-query-editor-sidebar"),
    ).not.toBeInTheDocument();
  });
});
