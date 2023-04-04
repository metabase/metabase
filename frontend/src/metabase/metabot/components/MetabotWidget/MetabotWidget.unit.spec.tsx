import React from "react";
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { Card, CollectionItem, Database, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCollectionItem,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import MetabotWidget from "./MetabotWidget";

const TEST_DATABASE = createMockDatabase({
  id: 1,
});

const TEST_USER = createMockUser({
  first_name: "Test",
  last_name: "Testy",
});

const TEST_MODEL = createMockCard({
  name: "Orders",
  dataset: true,
  dataset_query: {
    database: TEST_DATABASE.id,
    type: "query",
    query: {
      "source-table": 1,
    },
  },
});

const TEST_MODEL_ITEM = createMockCollectionItem({
  name: TEST_MODEL.name,
  model: "dataset",
});

const TEST_MODEL_PLACEHOLDER = `Ask something like, how many ${TEST_MODEL.name} have we had over time?`;

interface SetupOpts {
  databases?: Database[];
  cards?: Card[];
  collectionItems?: CollectionItem[];
  currentUser?: User;
}

const setup = async ({
  databases = [TEST_DATABASE],
  cards = [TEST_MODEL],
  collectionItems = [TEST_MODEL_ITEM],
  currentUser = TEST_USER,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);
  setupCardsEndpoints(cards);
  setupSearchEndpoints(collectionItems);

  const { history } = renderWithProviders(
    <>
      <Route path="/" component={MetabotWidget} />,
      <Route path="/metabot/database/:id" component={() => null} />
    </>,
    { storeInitialState: { currentUser }, withRouter: true },
  );

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/i));

  return { history };
};

describe("MetabotWidget", () => {
  it("should redirect to the database metabot page with the prompt", async () => {
    const { history } = await setup();

    userEvent.type(screen.getByPlaceholderText(TEST_MODEL_PLACEHOLDER), "How");
    userEvent.click(screen.getByRole("button", { name: "Get Answer" }));

    const location = history?.getCurrentLocation();
    expect(location?.pathname).toBe(`/metabot/database/${TEST_DATABASE.id}`);
  });
});
