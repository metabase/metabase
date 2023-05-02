import React, { ComponentPropsWithoutRef } from "react";
import { IndexRoute, Route } from "react-router";
import { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import QueryBuilder from "./QueryBuilder";

const TEST_DB = createSampleDatabase();

const TEST_CARD = createMockCard({
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
    },
  },
});

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

interface SetupOpts {
  card?: Card;
  initialRoute?: string;
}

const setup = async ({
  card = TEST_CARD,
  initialRoute = `/question/${card.id}`,
}: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardEndpoints(card);
  setupSearchEndpoints([]);
  setupAlertsEndpoints(card, []);
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);

  renderWithProviders(
    <Route path="/question">
      <IndexRoute component={TestQueryBuilder} />
      <Route path="notebook" component={TestQueryBuilder} />
      <Route path=":slug" component={TestQueryBuilder} />
      <Route path=":slug/notebook" component={TestQueryBuilder} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
    },
  );

  await waitForElementToBeRemoved(() => screen.queryByText(/Loading/));
};

describe("QueryBuilder", () => {
  it("renders a structured question in the notebook mode", async () => {
    await setup({
      card: TEST_CARD,
      initialRoute: `/question/${TEST_CARD.id}/notebook`,
    });

    expect(screen.getByDisplayValue(TEST_CARD.name)).toBeInTheDocument();
  });
});
