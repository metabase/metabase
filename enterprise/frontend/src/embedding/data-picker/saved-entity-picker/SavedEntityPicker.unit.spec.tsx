import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCollectionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { SavedEntityPicker } from "./SavedEntityPicker";

const CURRENT_USER = {
  id: 1,
  personal_collection_id: 222,
  is_superuser: true,
};

const COLLECTIONS = {
  PERSONAL: createMockCollection({
    id: CURRENT_USER.personal_collection_id,
    name: "My personal collection",
    personal_owner_id: CURRENT_USER.id,
    here: ["card"],
  }),
  REGULAR: createMockCollection({
    id: 1,
    name: "Regular collection",
    here: ["card"],
  }),
};

function mockCollectionItemsEndpoint() {
  fetchMock.get({
    url: "path:/api/collection/root/items",
    query: {
      "sort-column": "name",
      "sort-direction": "asc",
    },
    response: {
      total: 3,
      data: [
        createMockCollectionItem({
          id: 2,
          name: "a",
        }),
        createMockCollectionItem({
          id: 3,
          name: "A",
        }),
        createMockCollectionItem({
          id: 1,
          name: "B",
        }),
      ],
      models: ["card"],
      limit: null,
      offset: null,
    },
  });
}

async function setup() {
  setupCollectionsEndpoints({
    collections: [COLLECTIONS.PERSONAL, COLLECTIONS.REGULAR],
  });

  mockCollectionItemsEndpoint();

  const onBack = jest.fn();
  renderWithProviders(
    <SavedEntityPicker type="question" onSelect={jest.fn()} onBack={onBack} />,
  );
  await screen.findByTestId("saved-entity-back-navigation");
  await waitForLoaderToBeRemoved();

  return { onBack };
}

describe("SavedEntityPicker", () => {
  it("shows the current user personal collection on the top after the root", async () => {
    await setup();

    const treeItems = await screen.findAllByTestId("tree-item-name");

    expect(treeItems.map((node) => node.textContent)).toEqual([
      "Our analytics",
      "Your personal collection",
      "Regular collection",
    ]);
  });

  it("sorts saved questions case-insensitive (metabase#23693)", async () => {
    await setup();

    expect(
      screen.getAllByTestId("option-text").map((node) => node.textContent),
    ).toEqual(["a", "A", "B"]);
  });

  it("names the Saved Questions back link by its label only", async () => {
    await setup();

    expect(
      screen.getByRole("button", { name: "Saved Questions" }),
    ).toBeInTheDocument();
  });

  it("focuses the Saved Questions back link when pressing Tab", async () => {
    await setup();

    // focus the "‹ Saved Questions" back link
    await userEvent.tab();

    expect(screen.getByTestId("saved-entity-back-navigation")).toHaveFocus();
  });

  it("goes back when pressing Enter on the Saved Questions back link", async () => {
    const { onBack } = await setup();

    // focus the "‹ Saved Questions" back link
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("goes back when pressing Space on the Saved Questions back link", async () => {
    const { onBack } = await setup();

    // focus the "‹ Saved Questions" back link
    await userEvent.tab();
    await userEvent.keyboard(" ");

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
