import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Urls from "metabase/urls";
import type { TableIndexEntry, Transform } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTableIndexEntry,
  createMockTableIndexRequest,
  createMockTransform,
} from "metabase-types/api/mocks";

import { TransformIndexesPage } from "./TransformIndexesPage";

type SetupOpts = {
  transform?: Transform;
  indexes?: TableIndexEntry[];
};

function setup({
  transform = createMockTransform({ id: 1, name: "Test Transform" }),
  indexes = [],
}: SetupOpts = {}) {
  setupDatabasesEndpoints([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupUserMetabotPermissionsEndpoint();

  fetchMock.get(`path:/api/transform/${transform.id}`, transform);
  fetchMock.get({
    url: "path:/api/indexes",
    query: { "transform-id": transform.id },
    response: { data: indexes },
  });

  const initialRoute = Urls.transformIndexes(transform.id);
  const path = initialRoute.replace(`/${transform.id}/`, "/:transformId/");

  renderWithProviders(<Route path={path} component={TransformIndexesPage} />, {
    withRouter: true,
    initialRoute,
  });

  return { transform };
}

describe("TransformIndexesPage", () => {
  it("renders the empty state when there are no indexes", async () => {
    setup({ indexes: [] });
    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByText("No indexes defined for this transform."),
    ).toBeInTheDocument();
  });

  it("renders the list of indexes", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: "idx_orders_id",
          kind: "btree",
          request: createMockTableIndexRequest({ id: 1 }),
        }),
        createMockTableIndexEntry({
          name: "idx_orders_total",
          kind: "gin",
          request: createMockTableIndexRequest({ id: 2 }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(await screen.findByText("idx_orders_id")).toBeInTheDocument();
    expect(screen.getByText("idx_orders_total")).toBeInTheDocument();
  });

  it("falls back to the index kind when the index has no name", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: null,
          kind: "distkey",
          request: createMockTableIndexRequest({ status: "pending" }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(await screen.findByText("distkey")).toBeInTheDocument();
    expect(screen.getByText("distkey · pending")).toBeInTheDocument();
  });
});
