import React from "react";
import fetchMock from "fetch-mock";
import type { DatasetQuery } from "metabase-types/types/Card";

import { setupDatabasesEndpoints } from "__support__/server-mocks/database";
import { setupSearchEndpoints } from "__support__/server-mocks/search";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";

import {
  createMockStructuredDatasetQuery,
  createMockCard,
} from "metabase-types/api/mocks";

import {
  createSampleDatabase,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { Route } from "metabase/hoc/Title";
import { setupCardEndpoints } from "__support__/server-mocks";

const makeQuery = (options: any) => {
  return createMockStructuredDatasetQuery({
    query: options,
    // we have to cast this because we have 2 incompatible DatasetQuery types
  }) as DatasetQuery;
};

jest.mock("metabase/components/PopoverWithTrigger");

const TEST_CARD = createMockCard({ dataset: true });
const TEST_DATABASE = createSampleDatabase();
const TEST_TABLE_ID = PRODUCTS_ID;

const setup = async ({ query }: { query: DatasetQuery }) => {
  fetchMock.get("path:/api/alert/question/1", []);

  setupCardEndpoints(TEST_CARD);
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupSearchEndpoints([]);

  fetchMock.get("path:/api/bookmark", []);
  fetchMock.get("path:/api/timeline", []);

  console.log(TEST_DATABASE);

  renderWithProviders(
    <Route path="/model/:slug/query" component={QueryBuilder} />,
    {
      withRouter: true,
      initialRoute: `/model/${TEST_TABLE_ID}/query`,
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryAllByTestId("loading-spinner"),
  );
};

const appendFaviconElement = () => {
  const faviconElement = document.createElement("link");
  faviconElement.rel = "icon";
  document.head.append(faviconElement);
};

describe("QueryBuilder", () => {
  beforeAll(() => {
    appendFaviconElement();
  });

  it("should have beforeunload event when user tries to leave an edited existing model", async () => {
    const query = makeQuery({
      "source-table": TEST_TABLE_ID,
    });
    await setup({ query });

    // console.log(screen.getByText("Filter"));

    // screen.debug(undefined, 100000);
    expect(true).toBe(false);
  });
  it("should not have beforeunload event when user creates a new model", () => {
    expect(true).toBe(false);
  });
  it("should not have beforeunload event when user leaves unedited, existing model", () => {
    expect(true).toBe(false);
  });
});
