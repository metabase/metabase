import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  ADMIN_PERSONAL_COLLECTION,
  ADMIN_USER,
  FIRST_COLLECTION,
  FIRST_COLLECTION_ID,
} from "metabase/common/components/Pickers/tests/search";
import { DataStep } from "metabase/querying/notebook/components/DataStep";
import { NotebookProvider } from "metabase/querying/notebook/components/Notebook/context";
import { createMockNotebookStep } from "metabase/querying/notebook/test-utils";
import { Outlet, Route } from "metabase/router";
import Question from "metabase-lib/v1/Question";
import type {
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import CollectionLanding from "../CollectionLanding";

const ROOT = createMockCollection({ ...ROOT_COLLECTION, can_write: true });

// Listed before First collection, so the picker has a sibling of First
// collection that comes in the same response.
const SIBLING_COLLECTION = createMockCollection({
  id: 8,
  name: "Analytics collection",
  location: "/",
  can_write: true,
});

const MODEL_ID = 1;
const MODEL_NAME = "Orders Model";
const SIBLING_MODEL_NAME = "Products Model";

// The title the notebook data step gives its data picker
const DATA_PICKER_TITLE = "Pick your starting data";

type CollectionKey = number | "root";

const toCollectionKey = (collectionId: CollectionId | null): CollectionKey =>
  typeof collectionId === "number" ? collectionId : "root";

/**
 * A stand-in for the collection API of an instance with one model. The model
 * is listed only in the collection it is in, and the `here`/`below` of First
 * collection say whether it holds the model, as the backend computes them.
 * PUT /api/card/:id moves the model when the request arrives.
 */
function setupInstance() {
  let modelCollectionId: number | null = null;

  const getModelItem = () =>
    createMockCollectionItem({
      id: MODEL_ID,
      name: MODEL_NAME,
      model: "dataset",
      can_write: true,
      collection_id: modelCollectionId,
    });

  const getFirstCollectionItem = () => {
    const hasModel = modelCollectionId === FIRST_COLLECTION_ID;
    return createMockCollectionItem({
      id: FIRST_COLLECTION_ID,
      name: FIRST_COLLECTION.name,
      model: "collection",
      can_write: true,
      location: "/",
      here: hasModel ? ["dataset"] : [],
      below: [],
    });
  };

  const getItems = (collection: CollectionKey): CollectionItem[] => {
    const model =
      toCollectionKey(modelCollectionId) === collection ? [getModelItem()] : [];

    if (collection === "root") {
      return [
        createMockCollectionItem({
          id: Number(SIBLING_COLLECTION.id),
          name: SIBLING_COLLECTION.name,
          model: "collection",
          can_write: true,
          location: "/",
          here: ["dataset"],
          below: [],
        }),
        getFirstCollectionItem(),
        ...model,
      ];
    }
    if (collection === SIBLING_COLLECTION.id) {
      return [
        createMockCollectionItem({
          id: 2,
          name: SIBLING_MODEL_NAME,
          model: "dataset",
          collection_id: Number(SIBLING_COLLECTION.id),
        }),
      ];
    }
    return model;
  };

  const getRequestedItems = (url: URL, collection: CollectionKey) => {
    const models = url.searchParams.getAll("models");
    const pinnedState = url.searchParams.get("pinned-state");
    return getItems(collection)
      .filter((item) => models.length === 0 || models.includes(item.model))
      .filter(
        (item) => pinnedState !== "is_pinned" || item.collection_position,
      );
  };

  const parseCollectionKey = (url: URL): CollectionKey => {
    const id = url.pathname.split("/")[3];
    return id === "root" ? "root" : Number(id);
  };

  fetchMock.get(/\/api\/collection\/(\d+|root)\/items(\?|$)/, (call) => {
    const url = new URL(call.url);
    const items = getRequestedItems(url, parseCollectionKey(url));
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam === null ? items.length : Number(limitParam);
    return {
      data: items.slice(0, limit),
      total: items.length,
      models: url.searchParams.getAll("models"),
      limit: null,
      offset: null,
    };
  });

  fetchMock.get(/\/api\/collection\/(\d+|root)\/items\/metadata/, (call) => {
    const url = new URL(call.url);
    const items = getRequestedItems(url, parseCollectionKey(url));
    const availableModels: CollectionItemModel[] = Array.from(
      new Set(items.map((item) => item.model)),
    );
    return { available_models: availableModels, total_items: items.length };
  });

  const getCard = () =>
    createMockCard({
      id: MODEL_ID,
      name: MODEL_NAME,
      type: "model",
      collection_id: modelCollectionId,
    });

  fetchMock.get(`path:/api/card/${MODEL_ID}`, () => getCard());
  fetchMock.put(`path:/api/card/${MODEL_ID}`, (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    if (
      typeof body !== "object" ||
      body === null ||
      !("collection_id" in body) ||
      (typeof body.collection_id !== "number" && body.collection_id !== null)
    ) {
      return { status: 400 };
    }
    modelCollectionId = body.collection_id;
    return getCard();
  });
}

function getCardPutBodies() {
  return fetchMock.callHistory
    .calls(`path:/api/card/${MODEL_ID}`, { method: "PUT" })
    .map((call): unknown => JSON.parse(String(call.options.body)));
}

/**
 * The notebook data step of a new question next to the routed page, so its
 * data picker and the collection page share one store, as in the app.
 */
function PageWithNotebookDataStep() {
  const query = Question.create({
    metadata: createMockMetadata(),
    DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DB_ID,
  }).query();
  const step = createMockNotebookStep({ query });
  return (
    <>
      <NotebookProvider>
        <DataStep
          step={step}
          query={step.query}
          stageIndex={step.stageIndex}
          readOnly={false}
          color="background_surface-brand-strong"
          isLastOpened={false}
          reportTimezone="UTC"
          updateQuery={jest.fn()}
        />
      </NotebookProvider>
      <Outlet />
    </>
  );
}

function setup() {
  mockGetBoundingClientRect();
  const collections = [
    SIBLING_COLLECTION,
    FIRST_COLLECTION,
    ADMIN_PERSONAL_COLLECTION,
  ];
  setupCollectionByIdEndpoint({ collections: [ROOT, ...collections] });
  setupCollectionsEndpoints({ collections, rootCollection: ROOT });
  setupInstance();
  setupBookmarksEndpoints([]);
  setupDatabasesEndpoints([createMockDatabase()]);
  setupSearchEndpoints([]);
  setupNullGetUserKeyValueEndpoints();
  setupDashboardQuestionCandidatesEndpoint([]);
  setupUserMetabotPermissionsEndpoint();
  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupUserRecipientsEndpoint({ users: [ADMIN_USER] });

  renderWithProviders(
    <Route element={<PageWithNotebookDataStep />}>
      <Route path="/collection/:slug" element={<CollectionLanding />} />
    </Route>,
    {
      withRouter: true,
      withDND: true,
      withUndos: true,
      initialRoute: "/collection/root",
      storeInitialState: createMockState({ currentUser: ADMIN_USER }),
    },
  );
}

async function moveModelTo(collectionName: string) {
  const row = await screen.findByRole("row", { name: new RegExp(MODEL_NAME) });
  await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Move" }));

  const moveModal = await screen.findByRole("dialog", {
    name: `Move "${MODEL_NAME}"?`,
  });
  await userEvent.click(
    await within(moveModal).findByRole("link", {
      name: new RegExp(collectionName),
    }),
  );
  const moveButton = within(moveModal).getByRole("button", { name: "Move" });
  await waitFor(() => expect(moveButton).toBeEnabled());
  await userEvent.click(moveButton);
}

async function dismissMovedModelToast() {
  const toast = await screen.findByTestId("toast-undo");
  expect(within(toast).getByText("Moved model")).toBeInTheDocument();
  await userEvent.click(within(toast).getByLabelText("close icon"));
  await waitFor(() =>
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument(),
  );
}

const getDataPicker = () =>
  screen.getByRole("dialog", { name: DATA_PICKER_TITLE });

const getPickerLevel = (level: number) =>
  within(within(getDataPicker()).getByTestId(`item-picker-level-${level}`));

/** Opens the data picker from the mini picker, as "Browse all" does in the app. */
async function openDataPicker() {
  if (!screen.queryByTestId("mini-picker")) {
    await userEvent.click(
      screen.getByPlaceholderText(/search for tables and more/i),
    );
  }
  const miniPicker = await screen.findByTestId("mini-picker");
  await userEvent.click(await within(miniPicker).findByText("Browse all"));
  await screen.findByRole("dialog", { name: DATA_PICKER_TITLE });
}

async function closeDataPicker() {
  await userEvent.click(
    within(getDataPicker()).getByRole("button", { name: "Close" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: DATA_PICKER_TITLE }),
    ).not.toBeInTheDocument(),
  );
}

async function openPickerRootItem(name: string) {
  const rootLevel = await within(getDataPicker()).findByTestId(
    "item-picker-level-0",
  );
  await userEvent.click(
    await within(rootLevel).findByRole("link", { name: new RegExp(name) }),
  );
}

describe("DataPickerModal after moving a model (metabase#19737)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a moved model only in its new collection without refreshing", async () => {
    setup();

    // Move 1: Our analytics -> First collection
    await moveModelTo(FIRST_COLLECTION.name);
    await dismissMovedModelToast();
    expect(getCardPutBodies()).toEqual([
      {
        collection_id: FIRST_COLLECTION_ID,
        dashboard_id: null,
        archived: false,
      },
    ]);

    await openDataPicker();
    await openPickerRootItem("Our analytics");
    await userEvent.click(
      await getPickerLevel(1).findByRole("link", { name: /First collection/ }),
    );
    expect(await getPickerLevel(2).findByText(MODEL_NAME)).toBeInTheDocument();
    await closeDataPicker();

    // Move 2: First collection -> personal collection
    await userEvent.click(
      await screen.findByRole("link", { name: /First collection/ }),
    );
    await moveModelTo(ADMIN_PERSONAL_COLLECTION.name);
    await dismissMovedModelToast();
    expect(getCardPutBodies()).toEqual([
      {
        collection_id: FIRST_COLLECTION_ID,
        dashboard_id: null,
        archived: false,
      },
      {
        collection_id: ADMIN_PERSONAL_COLLECTION.id,
        dashboard_id: null,
        archived: false,
      },
    ]);

    await openDataPicker();
    await openPickerRootItem(ADMIN_PERSONAL_COLLECTION.name);
    expect(await getPickerLevel(1).findByText(MODEL_NAME)).toBeVisible();

    await openPickerRootItem("Our analytics");
    expect(
      await getPickerLevel(1).findByText(SIBLING_COLLECTION.name),
    ).toBeVisible();
    expect(
      getPickerLevel(1).queryByText(FIRST_COLLECTION.name),
    ).not.toBeInTheDocument();
  });
});
