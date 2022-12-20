import React from "react";
import nock from "nock";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  createMockCollection,
  createMockTable,
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
  }),
  REGULAR: createMockCollection({ id: 1, name: "Regular collection" }),
};

function mockCollectionTreeEndpoint() {
  nock(location.origin)
    .get("/api/collection/tree?tree=true")
    .reply(200, Object.values(COLLECTIONS));
}

function mockRootCollectionEndpoint(hasAccess) {
  if (hasAccess) {
    nock(location.origin)
      .get("/api/collection/root")
      .reply(200, createMockCollection({ id: "root", name: "Our analytics" }));
  } else {
    nock(location.origin)
      .get("/api/collection/root")
      .reply(200, "You don't have access to this collection");
  }
}

function mockCollectionEndpoint(requestedCollectionName) {
  const encodedName = encodeURIComponent(requestedCollectionName);
  nock(location.origin)
    .get(`/api/database/-1337/schema/${encodedName}`)
    .reply(200, [
      createMockTable({
        id: "card__1",
        display_name: "B",
        schema: requestedCollectionName,
      }),
      createMockTable({
        id: "card__2",
        display_name: "a",
        schema: requestedCollectionName,
      }),
      createMockTable({
        id: "card__3",
        display_name: "A",
        schema: requestedCollectionName,
      }),
    ]);
}

async function setup({
  canAccessRoot = true,
  requestedCollectionName = "Everything else",
} = {}) {
  mockCollectionTreeEndpoint();
  mockCollectionEndpoint(requestedCollectionName);
  mockRootCollectionEndpoint(canAccessRoot);
  renderWithProviders(
    <SavedQuestionPicker onSelect={jest.fn()} onBack={jest.fn()} />,
  );
  await waitForElementToBeRemoved(() => screen.queryAllByText("Loading..."));
}

describe("SavedQuestionPicker", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("shows the current user personal collection on the top after the root", async () => {
    await setup();

    expect(
      screen.getAllByTestId("tree-item-name").map(node => node.innerHTML),
    ).toEqual([
      "Our analytics",
      "Your personal collection",
      "Regular collection",
    ]);
  });

  it("sorts saved questions case-insensitive (metabase#23693)", async () => {
    await setup();

    expect(
      screen.getAllByTestId("option-text").map(node => node.innerHTML),
    ).toEqual(["a", "A", "B"]);
  });
});
