import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { BulkMoveModal } from "./MoveModal";

const WORKTREE_ID = 7;
const BRANCH_COLLECTION_ID = 20;
const BRANCH_SUB_COLLECTION_ID = 21;

const rootCollection = createMockCollection(ROOT_COLLECTION);

const mainCollection = createMockCollection({
  id: 11,
  name: "Main collection",
  location: "/",
  can_write: true,
});

const branchCollection = createMockCollection({
  id: BRANCH_COLLECTION_ID,
  name: "Branch collection",
  location: "/",
  can_write: true,
  worktree_id: WORKTREE_ID,
});

const branchSubCollection = createMockCollection({
  id: BRANCH_SUB_COLLECTION_ID,
  name: "Branch sub-collection",
  location: `/${BRANCH_COLLECTION_ID}/`,
  can_write: true,
  worktree_id: WORKTREE_ID,
});

const movingItem = createMockCollectionItem({
  id: 1,
  name: "Branch question",
  model: "card",
  collection_id: BRANCH_COLLECTION_ID,
});

function setup() {
  process.env.OVERSCAN = "20";
  mockGetBoundingClientRect();

  setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
  setupCollectionByIdEndpoint({
    collections: [rootCollection, mainCollection, branchCollection],
  });
  setupCollectionItemsEndpoint({
    collection: branchCollection,
    collectionItems: [
      createMockCollectionItem({
        id: BRANCH_SUB_COLLECTION_ID,
        model: "collection",
        name: branchSubCollection.name,
        can_write: true,
      }),
    ],
  });
  fetchMock.get("path:/api/collection", (call) => {
    const worktreeId = new URL(call.url).searchParams.get("worktree-id");
    return worktreeId === String(WORKTREE_ID)
      ? [rootCollection, branchCollection, branchSubCollection]
      : [rootCollection, mainCollection];
  });
  fetchMock.get("path:/api/search", { data: [] });

  renderWithProviders(
    <BulkMoveModal
      onClose={jest.fn()}
      onMove={jest.fn()}
      selectedItems={[movingItem]}
      initialCollectionId={branchCollection.id}
      worktreeId={WORKTREE_ID}
    />,
  );
}

describe("BulkMoveModal", () => {
  it("offers only the branch's collections when moving branch content", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(await screen.findByText("Branch collection")).toBeInTheDocument();
    expect(
      await screen.findByText("Branch sub-collection"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();
    expect(screen.queryByText("Main collection")).not.toBeInTheDocument();
  });

  it("does not offer searching outside the branch", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(await screen.findByText("Branch collection")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent items")).not.toBeInTheDocument();
  });
});
