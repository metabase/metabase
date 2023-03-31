import React from "react";
import fetchMock from "fetch-mock";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";
import SavedQuestionPicker from "./SavedQuestionPicker";

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

function mockCollectionTreeEndpoint() {
  fetchMock.get(
    { url: "path:/api/collection/tree", query: { tree: true } },
    Object.values(COLLECTIONS),
  );
}

function mockRootCollectionEndpoint(hasAccess) {
  if (hasAccess) {
    fetchMock.get(
      "path:/api/collection/root",
      createMockCollection({ id: "root", name: "Our analytics" }),
    );
  } else {
    fetchMock.get(
      "path:/api/collection/root",
      "You don't have access to this collection",
    );
  }
}

function mockCollectionItems() {
  return fetchMock.get("path:/api/collection/root/items", {
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
  });
}

async function setup({ canAccessRoot = true } = {}) {
  mockCollectionTreeEndpoint();
  mockRootCollectionEndpoint(canAccessRoot);
  const fetchCollectionItemsMock = mockCollectionItems();

  renderWithProviders(
    <SavedQuestionPicker onSelect={jest.fn()} onBack={jest.fn()} />,
  );
  await waitForElementToBeRemoved(() => screen.queryAllByText("Loading..."));

  return { fetchCollectionItemsMock };
}

describe("SavedQuestionPicker", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it("shows the current user personal collection on the top after the root", async () => {
    await setup();

    expect(
      screen.getAllByTestId("tree-item-name").map(node => node.textContent),
    ).toEqual([
      "Our analytics",
      "Your personal collection",
      "Regular collection",
    ]);
  });

  it("sorts saved questions case-insensitive (metabase#23693)", async () => {
    const { fetchCollectionItemsMock } = await setup();

    expect(fetchCollectionItemsMock.lastCall()[0]).toMatch(
      "sort_column=name&sort_direction=asc",
    );

    expect(
      screen.getAllByTestId("option-text").map(node => node.textContent),
    ).toEqual(["a", "A", "B"]);
  });
});
