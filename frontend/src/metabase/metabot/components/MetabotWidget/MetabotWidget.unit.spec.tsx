import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Card, CollectionItem, Database, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCollectionItem,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

import MetabotWidget from "./MetabotWidget";

const TEST_DATABASE = createMockDatabase({
  id: 1,
  name: "DB1",
});

const TEST_DATABASE_2 = createMockDatabase({
  id: 2,
  name: "DB2",
});

const TEST_USER = createMockUser({
  first_name: "Test",
  last_name: "Testy",
});

const TEST_USER_2 = createMockUser({
  first_name: null,
  last_name: null,
});

const TEST_MODEL = createMockCard({
  name: "Orders",
  type: "model",
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

const TEST_QUESTION_ITEM = createMockCollectionItem({
  name: "Question",
  model: "card",
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
  collectionItems = [TEST_MODEL_ITEM, TEST_QUESTION_ITEM],
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

  await waitForLoaderToBeRemoved();

  return { history };
};

describe("MetabotWidget", () => {
  it("should redirect to the database metabot page with the prompt", async () => {
    const { history } = await setup();

    await userEvent.type(
      screen.getByPlaceholderText(TEST_MODEL_PLACEHOLDER),
      "How",
    );
    await userEvent.click(screen.getByRole("button", { name: "Get Answer" }));

    const location = history?.getCurrentLocation();
    expect(location?.pathname).toBe(`/metabot/database/${TEST_DATABASE.id}`);
  });

  it("should allow to select a database if there are multiple databases", async () => {
    const { history } = await setup({
      databases: [TEST_DATABASE, TEST_DATABASE_2],
    });

    await userEvent.click(screen.getByText(TEST_DATABASE.name));
    await userEvent.click(screen.getByText(TEST_DATABASE_2.name));
    await userEvent.type(
      screen.getByPlaceholderText(TEST_MODEL_PLACEHOLDER),
      "How",
    );
    await userEvent.click(screen.getByRole("button", { name: "Get Answer" }));

    const location = history?.getCurrentLocation();
    expect(location?.pathname).toBe(`/metabot/database/${TEST_DATABASE_2.id}`);
  });

  it("should use a generic placeholder if a model is not available", async () => {
    await setup({
      collectionItems: [TEST_QUESTION_ITEM],
    });

    expect(screen.getByPlaceholderText("Ask something…")).toBeInTheDocument();
  });

  it("should show a greeting message based on the user name", async () => {
    await setup();

    expect(screen.getByText(/Hey there, Test!/)).toBeInTheDocument();
  });

  it("should show a generic greeting message if no user name is available", async () => {
    await setup({
      currentUser: TEST_USER_2,
    });

    expect(screen.getByText(/Hey there!/)).toBeInTheDocument();
  });

  it("should not suggest databases that do not support metabot", async () => {
    const mongoDbName = "Mongo";
    await setup({
      databases: [
        TEST_DATABASE,
        TEST_DATABASE_2,
        createMockDatabase({
          id: 3,
          name: mongoDbName,
          engine: "mongo",
        }),
      ],
    });

    await userEvent.click(screen.getByText(TEST_DATABASE.name));
    expect(screen.queryByText(mongoDbName)).not.toBeInTheDocument();
  });
});
