import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import _ from "underscore";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import {
  type ChatContextProviderFn,
  type DeregisterChatContextProviderFn,
  MetabotContext,
  defaultContext,
} from "metabase/metabot";
import { checkNotNull } from "metabase/utils/types";
import type {
  Card,
  Database,
  MetabotUserIsViewingContext,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DatasetQueryEditor } from "./DatasetQueryEditor";

// NativeQueryEditor is mocked globally in test/register-visualizations.js, but this suite inspects its children.
// jest hoists the unmock above the imports, so the query builder graph the store setup loads gets the real editor.
jest.unmock("metabase/querying/components/NativeQueryEditor");
// The Metabot prompt shortcut needs the real CodeMirror, which test/__support__/mocks.js replaces with a textarea.
jest.unmock("@uiw/react-codemirror");

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

const TEST_NATIVE_MODEL = createMockCard({
  id: 2,
  type: "model",
  dataset_query: TEST_NATIVE_CARD.dataset_query,
});

const TEST_NOTEBOOK_MODEL = createMockCard({
  id: 3,
  type: "model",
  dataset_query: createMockStructuredDatasetQuery({
    database: TEST_DB.id,
    query: { "source-table": ORDERS_ID },
  }),
});

const MONGO_DB = createSampleDatabase({ engine: "mongo" });

const TEST_MONGO_MODEL = createMockCard({
  id: 4,
  type: "model",
  dataset_query: createMockNativeDatasetQuery({
    database: MONGO_DB.id,
    native: { query: '[{"$limit":1}]', collection: "ORDERS" },
  }),
});

const ROOT_COLLECTION = createMockCollection({ id: "root" });

interface SetupOpts {
  database?: Database;
  card?: Card;
  height?: number;
  availableHeight?: number;
  isActive: boolean;
  readOnly?: boolean;
}

const setup = async ({
  database = TEST_DB,
  card = TEST_NATIVE_CARD,
  height = 300,
  availableHeight = 600,
  isActive,
  readOnly = false,
}: SetupOpts) => {
  setupUserMetabotPermissionsEndpoint();
  setupDatabasesEndpoints([database]);
  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupNativeQuerySnippetEndpoints();
  setupSearchEndpoints([]);

  const storeInitialState = createMockState({
    currentUser: createMockUser(),
    settings: mockSettings({
      "metabot-enabled?": true,
      "llm-metabot-configured?": true,
    }),
    entities: createMockEntitiesState({
      databases: [database],
      questions: [card],
    }),
  });
  const metadata = createMockMetadataFromState(storeInitialState);
  const question = checkNotNull(metadata.question(card.id));
  const onSetDatabaseId = jest.fn();
  const registerChatContextProvider = jest.fn(
    (_provider: ChatContextProviderFn): DeregisterChatContextProviderFn =>
      _.noop,
  );
  const metabotContext = { ...defaultContext, registerChatContextProvider };
  const withMetabotContext = (editor: ReactElement) => (
    <MetabotContext.Provider value={metabotContext}>
      {editor}
    </MetabotContext.Provider>
  );

  const { rerender, store } = renderWithProviders(
    withMetabotContext(
      <DatasetQueryEditor
        isActive={isActive}
        height={height}
        availableHeight={availableHeight}
        question={question}
        readOnly={readOnly}
        onResizeStop={_.noop}
        onSetDatabaseId={onSetDatabaseId}
        setDatasetQuery={_.noop}
        isNativeEditorOpen
      />,
    ),
    { storeInitialState },
  );

  // required for preventing memory leak
  await waitForLoaderToBeRemoved();

  const getViewedItems = async (): Promise<MetabotUserIsViewingContext> => {
    const contexts = await Promise.all(
      registerChatContextProvider.mock.calls.map(([provider]) =>
        provider(store.getState()),
      ),
    );
    return contexts.flatMap((context) =>
      context ? (context.user_is_viewing ?? []) : [],
    );
  };

  return {
    question,
    rerender: (editor: ReactElement) => rerender(withMetabotContext(editor)),
    getViewedItems,
  };
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
    const { question, rerender } = await setup({
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

  it("gives Metabot the SQL editor of a SQL model as a buffer", async () => {
    const { getViewedItems } = await setup({
      card: TEST_NATIVE_MODEL,
      isActive: true,
    });

    expect(await getViewedItems()).toContainEqual(
      expect.objectContaining({
        type: "code_editor",
        buffers: [expect.objectContaining({ id: "qb" })],
      }),
    );
  });

  it("gives Metabot no SQL buffer or SQL prompt for a MongoDB model", async () => {
    const { getViewedItems } = await setup({
      database: MONGO_DB,
      card: TEST_MONGO_MODEL,
      isActive: true,
    });
    const editor = await screen.findByRole("textbox");
    await waitFor(() => expect(editor).toHaveTextContent("$limit"));
    await userEvent.click(editor);
    // CodeMirror reads a shifted letter binding from `keyCode`, which `userEvent.keyboard` does not set.
    fireEvent.keyDown(editor, {
      key: "I",
      code: "KeyI",
      keyCode: 73,
      ctrlKey: true,
      shiftKey: true,
    });
    await waitForRequestsToSettle();

    expect(await getViewedItems()).not.toContainEqual(
      expect.objectContaining({ type: "code_editor" }),
    );
    expect(
      screen.queryByTestId("metabot-inline-sql-prompt"),
    ).not.toBeInTheDocument();
  });

  it("gives Metabot no SQL buffer for a notebook model", async () => {
    const { getViewedItems } = await setup({
      card: TEST_NOTEBOOK_MODEL,
      isActive: true,
    });

    expect(await getViewedItems()).not.toContainEqual(
      expect.objectContaining({ type: "code_editor" }),
    );
  });
});
