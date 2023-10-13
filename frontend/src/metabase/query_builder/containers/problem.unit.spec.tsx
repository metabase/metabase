import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentPropsWithoutRef } from "react";
import { Route } from "react-router";
import type { Card, Dataset, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDataset,
  createMockModelIndex,
} from "metabase-types/api/mocks";

import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardDataset,
  setupCardQueryEndpoints,
  setupCardsEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupModelIndexEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import NewItemMenu from "metabase/containers/NewItemMenu";
import { checkNotNull } from "metabase/core/utils/types";
import { serializeCardForUrl } from "metabase/lib/card";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import registerVisualizations from "metabase/visualizations/register";
import QueryBuilder from "./QueryBuilder";

registerVisualizations();

const TEST_DB = createSampleDatabase();

const TEST_CARD = createMockCard({
  id: 1,
  name: "Test card",
  dataset: true,
});

const TEST_COLLECTION = createMockCollection();

const TestQueryBuilder = (
  props: ComponentPropsWithoutRef<typeof QueryBuilder>,
) => {
  return (
    <div>
      <link rel="icon" />
      <QueryBuilder {...props} />
    </div>
  );
};

const TestHome = () => <NewItemMenu trigger={<button>New</button>} />;

function isSavedCard(card: Card | UnsavedCard | null): card is Card {
  return card !== null && "id" in card;
}

interface SetupOpts {
  card?: Card | UnsavedCard | null;
  dataset?: Dataset;
  initialRoute?: string;
}

const setup = async ({
  card = TEST_CARD,
  dataset = createMockDataset(),
  initialRoute = `/question${
    isSavedCard(card) ? `/${card.id}` : `#${serializeCardForUrl(card)}`
  }`,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardDataset(dataset);
  setupSearchEndpoints([]);
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);
  setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
  if (isSavedCard(card)) {
    setupCardsEndpoints([card]);
    setupCardQueryEndpoints(card, dataset);
    setupAlertsEndpoints(card, []);
    setupModelIndexEndpoints(card.id, []);
  }

  // this workaround can be removed when metabase#34523 is fixed
  if (card === null) {
    fetchMock.get("path:/api/model-index", [createMockModelIndex()]);
  }

  const mockEventListener = jest.spyOn(window, "addEventListener");

  const { history } = renderWithProviders(
    <Route>
      <Route path="/" component={TestHome} />
      <Route path="/model">
        <Route path="new" component={NewModelOptions} />
        <Route path="query" component={TestQueryBuilder} />
        <Route path="metadata" component={TestQueryBuilder} />
        <Route path=":slug/query" component={TestQueryBuilder} />
        <Route path=":slug/metadata" component={TestQueryBuilder} />
      </Route>
    </Route>,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitForLoaderToBeRemoved();

  return {
    history: checkNotNull(history),
    mockEventListener,
  };
};

describe("problem", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("renders a structured question in the simple mode", async () => {
    await setup({
      card: null,
      initialRoute: "/",
    });

    expect(1).toBe(1);
  });

  // This test passes only if the previous test is executed too, i.e. when you remove .only
  // Question is: why? how does the previous test affect this one?
  it.only("shows custom warning modal when leaving via SPA navigation", async () => {
    const { history } = await setup({
      card: null,
      initialRoute: "/",
    });

    history.push("/model/new");
    await waitForLoaderToBeRemoved();

    await startNewNotebookModel();

    history.goBack();

    expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
  });
});

const startNewNotebookModel = async () => {
  userEvent.click(screen.getByText("Use the notebook editor"));
  await waitForLoaderToBeRemoved();

  // uncommenting this line will make the test pass as well
  // await new Promise(resolve => setTimeout(resolve, 1000));

  userEvent.click(screen.getByText("Pick your starting data"));
  const popover = screen.getByTestId("popover");
  userEvent.click(within(popover).getByText("Sample Database"));
  await waitForLoaderToBeRemoved();
  userEvent.click(within(popover).getByText("Orders"));
  userEvent.click(within(screen.getByTestId("popover")).getByText("Orders"));

  expect(screen.getByRole("button", { name: "Get Answer" })).toBeEnabled();
};
