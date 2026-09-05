import _ from "underscore";

import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import { checkNotNull } from "metabase/utils/types";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DatasetQueryEditor } from "./DatasetQueryEditor";

// NativeQueryEditor is mocked globally in test/register-visualizations.js, but this suite inspects its children.
// jest hoists the unmock above the imports, so the query builder graph the store setup loads gets the real editor.
jest.unmock("metabase/querying/components/NativeQueryEditor");

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
  availableHeight?: number;
  isActive: boolean;
  readOnly?: boolean;
}

const setup = async ({
  card = TEST_NATIVE_CARD,
  height = 300,
  availableHeight = 600,
  isActive,
  readOnly = false,
}: SetupOpts) => {
  setupUserMetabotPermissionsEndpoint();
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
  const query = checkNotNull(question.legacyNativeQuery());
  const onSetDatabaseId = jest.fn();

  const { rerender } = renderWithProviders(
    <DatasetQueryEditor
      isActive={isActive}
      height={height}
      availableHeight={availableHeight}
      query={query}
      question={question}
      readOnly={readOnly}
      onResizeStop={_.noop}
      onSetDatabaseId={onSetDatabaseId}
      setDatasetQuery={_.noop}
      isNativeEditorOpen
    />,
  );

  // required for preventing memory leak
  await waitForLoaderToBeRemoved();

  return { query, question, rerender };
};

describe("DatasetQueryEditor", () => {
  it("renders sidebar when query tab is active", async () => {
    await setup({ isActive: true });

    expect(
      screen.getByTestId("native-query-editor-action-buttons"),
    ).toBeInTheDocument();
  });

  it("shows the native query editor container when query tab is active", async () => {
    await setup({ isActive: true });

    expect(screen.getByTestId("native-query-editor-container")).toBeVisible();
  });

  it("does not render sidebar when query tab is inactive", async () => {
    await setup({ isActive: false });

    expect(
      screen.queryByTestId("native-query-editor-action-buttons"),
    ).not.toBeInTheDocument();
  });

  it("re-renders DatasetQueryEditor when height is 0 and isActive prop changes", async () => {
    const { query, question, rerender } = await setup({
      height: 0,
      isActive: true,
    });
    const onSetDatabaseId = jest.fn();

    expect(
      screen.getByTestId("native-query-editor-action-buttons"),
    ).toBeInTheDocument();

    rerender(
      <DatasetQueryEditor
        isActive={false}
        height={0}
        availableHeight={600}
        query={query}
        question={question}
        readOnly={false}
        onResizeStop={_.noop}
        onSetDatabaseId={onSetDatabaseId}
        setDatasetQuery={_.noop}
        isNativeEditorOpen
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("native-query-editor-action-buttons"),
      ).not.toBeInTheDocument();
    });
  });
});
