import fetchMock from "fetch-mock";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { MoveActionModal } from "./MoveActionModal";

const DATA_ACTIONS_ROOT = createMockCollection({
  id: "root",
  name: "Data actions",
  namespace: "data-actions",
});

const setup = () => {
  mockGetBoundingClientRect();
  const defaultRoot = createMockCollection({
    id: "root",
    name: "Our analytics",
  });

  setupCollectionsEndpoints({ collections: [], rootCollection: defaultRoot });
  fetchMock.modifyRoute("collection-root", {
    response: (call: { url: string }) =>
      new URL(call.url).searchParams.get("namespace") === "data-actions"
        ? DATA_ACTIONS_ROOT
        : defaultRoot,
  });
  fetchMock.get("path:/api/collection/1", createMockCollection({ id: 1 }));
  fetchMock.get("path:/api/collection/1/items", {
    data: [],
    total: 0,
    limit: null,
    offset: null,
  });
  fetchMock.get("path:/api/collection/root/items", (call: { url: string }) => {
    const isDataActions =
      new URL(call.url).searchParams.get("namespace") === "data-actions";
    const data = [
      createMockCollectionItem({
        id: isDataActions ? 502 : 501,
        name: isDataActions ? "Retention Actions" : "Marketing Questions",
        model: "collection",
      }),
    ];
    return { data, total: data.length, limit: null, offset: null };
  });

  renderWithProviders(
    <MoveActionModal
      action={createMockQueryAction({ collection_id: null })}
      onClose={jest.fn()}
    />,
    { storeInitialState: createMockState() },
  );
};

describe("MoveActionModal", () => {
  it("should list data action folders when action is in root collection", async () => {
    setup();

    expect(await screen.findByText("Retention Actions")).toBeInTheDocument();
    expect(screen.queryByText("Our analytics")).not.toBeInTheDocument();
    expect(screen.queryByText("Marketing Questions")).not.toBeInTheDocument();
  });
});
