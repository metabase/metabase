import React from "react";
import fetchMock from "fetch-mock";
import type { DatasetQuery } from "metabase-types/types/Card";

import {
  setupDatabaseEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks/database";
import { setupSearchEndpoints } from "__support__/server-mocks/search";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import {
  createMockStructuredDatasetQuery,
  createMockModelObject,
  createMockCard,
  createMockDatabase,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { createEntitiesState } from "__support__/store";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { Route } from "metabase/hoc/Title";
import { setupCardEndpoints } from "__support__/server-mocks";

const makeQuery = (options: any) => {
  return createMockStructuredDatasetQuery({
    query: options,
    // we have to cast this because we have 2 incompatible DatasetQuery types
  }) as DatasetQuery;
};

const setup = async ({ query }: { query: DatasetQuery }) => {
  const mockCard = createMockCard({ dataset: true });
  const mockDatabase = createSampleDatabase();

  fetchMock.get("path:/api/alert/question/1", []);

  console. log(mockCard);

  setupCardEndpoints(mockCard);
  setupDatabasesEndpoints([mockDatabase]);
  setupSearchEndpoints([]);
  // const database = createSampleDatabase();
  // const state = createMockState({
  //   entities: createEntitiesState({
  //     databases: [database],
  //   }),
  //   qb: createMockQueryBuilderState({
  //     card: mockCard,
  //     originalCard: mockCard,
  //   })
  // });
  // createMockModelObject({ id: 1 });

  fetchMock.get("path:/api/bookmark", []);
  fetchMock.get("path:/api/timeline", []);

  // setupDatabasesEndpoints([database]);
  // setupSearchEndpoints([]);
  // setupCardEndpoints(mockCard)

  jest.spyOn(document, "querySelector").mockImplementation(() => {
    return {
      setAttribute: () => {},
    };
  });

  renderWithProviders(
    <Route path="/model/:slug/query" component={QueryBuilder} />,
    {
      // storeInitialState: state,
      withRouter: true,
      initialRoute: "/model/1/query",
    },
  );

  await waitForElementToBeRemoved(() =>
    screen.queryAllByTestId("loading-spinner"),
  );
};

describe("QueryBuilder", () => {
  it("should have beforeunload event when user tries to leave an edited existing model", async () => {
    const query = makeQuery({
      "source-table": 2,
    });
    await setup({ query });
    screen.debug();
  });
  it("should not have beforeunload event when user creates a new model", () => {});
  it("should not have beforeunload event when user leaves unedited, existing model", () => {});
});
