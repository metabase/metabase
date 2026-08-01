import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupCustomVizPluginListEndpoint,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { QueryModals } from "./QueryModals";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

const MAIN_COLLECTION = createMockCollection({
  id: 10,
  name: "Analytics",
  can_write: true,
});

const BRANCH_COLLECTION = createMockCollection({
  id: 11,
  name: "Analytics",
  can_write: true,
  worktree_id: 5,
});

const COLLECTION_PICKER_TITLE = "Where do you want to save this?";
const BRANCH_COLLECTION_URL = `path:/api/collection/${BRANCH_COLLECTION.id}`;

function createUnsavedQuestion(collectionId: CollectionId) {
  return new Question(
    {
      collection_id: collectionId,
      display: "table",
      type: "question",
      visualization_settings: {},
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      },
    },
    metadata,
  );
}

type SetupOpts = {
  collectionId?: CollectionId;
  modal?: QueryModalType;
};

function setup({
  collectionId = BRANCH_COLLECTION.id,
  modal = MODAL_TYPES.SAVE,
}: SetupOpts = {}) {
  setupCollectionByIdEndpoint({
    collections: [MAIN_COLLECTION, BRANCH_COLLECTION],
  });
  setupCollectionsEndpoints({
    collections: [MAIN_COLLECTION, BRANCH_COLLECTION],
  });
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupDatabasesEndpoints([]);
  setupLibraryEndpoints();
  setupCustomVizPluginListEndpoint();

  const question = createUnsavedQuestion(collectionId);

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "remote-sync-enabled": true,
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
    qb: createMockQueryBuilderState({ card: question.card() }),
  });

  setupEnterpriseOnlyPlugin("content_studio");

  renderWithProviders(
    <QueryModals
      modal={modal}
      modalContext={0}
      question={question}
      originalQuestion={question}
      card={question.card()}
      setQueryBuilderMode={jest.fn()}
      onCreate={jest.fn()}
      onSave={jest.fn()}
      onCloseModal={jest.fn()}
      onOpenModal={jest.fn()}
      onChangeLocation={jest.fn()}
    />,
    { storeInitialState },
  );
}

describe("QueryModals", () => {
  afterEach(() => {
    reinitialize();
  });

  it("locks the save modal onto a collection checked out on a branch", async () => {
    setup({ collectionId: BRANCH_COLLECTION.id });

    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls(BRANCH_COLLECTION_URL),
      ).not.toHaveLength(0),
    );
    expect(screen.queryByText(COLLECTION_PICKER_TITLE)).not.toBeInTheDocument();
  });

  it("keeps the save modal's picker for a collection on the main branch", async () => {
    setup({ collectionId: MAIN_COLLECTION.id });

    expect(
      await screen.findByText(COLLECTION_PICKER_TITLE),
    ).toBeInTheDocument();
  });

  it("does not look up the collection while the save modal is closed", async () => {
    setup({ modal: MODAL_TYPES.CAN_NOT_CREATE_MODEL });

    expect(
      await screen.findByText("Variables in models aren't supported yet"),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(BRANCH_COLLECTION_URL)).toHaveLength(0);
  });
});
