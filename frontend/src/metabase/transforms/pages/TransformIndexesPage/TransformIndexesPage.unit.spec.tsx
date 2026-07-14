import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetTransformEndpoint,
  setupListTableIndexesEndpoint,
  setupUserMetabotPermissionsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  TableIndexEntry,
  Transform,
  UserListResult,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTableIndexEntry,
  createMockTableIndexRequest,
  createMockTransform,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { TransformIndexesPage } from "./TransformIndexesPage";

type SetupOpts = {
  transform?: Transform;
  indexes?: TableIndexEntry[];
  users?: UserListResult[];
};

function setup({
  transform = createMockTransform({ id: 1, name: "Test Transform" }),
  indexes = [],
  users = [],
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupUserMetabotPermissionsEndpoint();
  setupUsersEndpoints(users);

  setupGetTransformEndpoint(transform);
  setupListTableIndexesEndpoint(transform.id, indexes);

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
      screen.getByText(
        "Index the key columns of your transforms to make them faster and more efficient.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the list of indexes", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: "idx_orders_id",
          kind: "btree",
          key_columns: ["id"],
          request: createMockTableIndexRequest({ id: 1 }),
        }),
        createMockTableIndexEntry({
          name: "idx_orders_total",
          kind: "gin",
          key_columns: ["total"],
          request: createMockTableIndexRequest({ id: 2 }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("idx_orders_id")).toBeInTheDocument();
    expect(screen.getByText("idx_orders_total")).toBeInTheDocument();
  });

  it("renders the index columns, type, source and status", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: "idx_city_country",
          kind: "btree",
          metabase_managed: true,
          key_columns: ["City name", "Country"],
          request: createMockTableIndexRequest({ status: "create-pending" }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("idx_city_country")).toBeInTheDocument();
    expect(screen.getByText("btree")).toBeInTheDocument();
    expect(screen.getByText("City name, Country")).toBeInTheDocument();
    expect(screen.getByText("Managed")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("resolves the last modified by user name", async () => {
    setup({
      users: [createMockUserListResult({ id: 7, common_name: "Maz Ameli" })],
      indexes: [
        createMockTableIndexEntry({
          name: "idx_orders_id",
          request: createMockTableIndexRequest({ created_by: 7 }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(await screen.findByText("Maz Ameli")).toBeInTheDocument();
  });

  it("shows 'Never' when the index has not been run", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: "idx_orders_id",
          request: createMockTableIndexRequest({ last_executed_at: null }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("falls back to the index kind when the index has no name", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: null,
          kind: "distkey",
          request: createMockTableIndexRequest({ status: "create-pending" }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    // The kind appears in both the Name (fallback) and Type columns.
    expect(screen.getAllByText("distkey")).toHaveLength(2);
  });
});
