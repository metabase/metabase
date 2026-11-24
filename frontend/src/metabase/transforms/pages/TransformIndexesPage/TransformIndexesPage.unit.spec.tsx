import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetTransformEndpoint,
  setupListTableIndexesEndpoint,
  setupUserMetabotPermissionsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  QueryTransformSource,
  TableIndexEntry,
  Transform,
  UserListResult,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockRequestableIndexes,
  createMockTableIndexEntry,
  createMockTableIndexRequest,
  createMockTokenFeatures,
  createMockTransform,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { TransformIndexesPage } from "./TransformIndexesPage";

const QUERY_SOURCE: QueryTransformSource = {
  type: "query",
  query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
};

type SetupOpts = {
  transform?: Transform;
  indexes?: TableIndexEntry[];
  users?: UserListResult[];
  remoteSyncReadOnly?: boolean;
  warehouseError?: string | null;
};

function setup({
  transform = createMockTransform({
    id: 1,
    name: "Test Transform",
    source: QUERY_SOURCE,
  }),
  indexes = [],
  users = [],
  remoteSyncReadOnly = false,
  warehouseError = null,
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
  setupListTableIndexesEndpoint(transform.id, indexes, warehouseError);

  const storeInitialState = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncReadOnly ? "read-only" : undefined,
      "remote-sync-enabled": remoteSyncReadOnly,
      "token-features": createMockTokenFeatures({
        remote_sync: remoteSyncReadOnly,
      }),
    }),
  });
  if (remoteSyncReadOnly) {
    setupEnterpriseOnlyPlugin("remote_sync");
  }

  const initialRoute = Urls.transformIndexes(transform.id);
  const path = initialRoute.replace(`/${transform.id}/`, "/:transformId/");

  renderWithProviders(
    <Route path={path} element={<TransformIndexesPage />} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState,
    },
  );

  return { transform };
}

describe("TransformIndexesPage", () => {
  it("lists pending and removing index requests sorted by name, and toggles the sort from the Name header", async () => {
    setup({
      transform: createMockTransform({
        id: 1,
        name: "Indexes list transform",
        source: QUERY_SOURCE,
        requestable_indexes: createMockRequestableIndexes(),
      }),
      users: [
        createMockUserListResult({ id: 1, common_name: "Bobby Tables" }),
        createMockUserListResult({ id: 2, common_name: "Ed Winters" }),
      ],
      // The response is in reverse name order, so the default sort must reorder it.
      indexes: [
        createMockTableIndexEntry({
          name: "idx_animal_score",
          kind: "btree",
          metabase_managed: true,
          present_in_warehouse: false,
          key_columns: ["score", "name"],
          request: createMockTableIndexRequest({
            id: 2,
            index_name: "idx_animal_score",
            status: "delete-pending",
            created_by: 2,
            last_executed_at: "2024-03-05T10:00:00Z",
          }),
        }),
        createMockTableIndexEntry({
          name: "idx_animal_name",
          kind: "btree",
          metabase_managed: true,
          present_in_warehouse: false,
          key_columns: ["name"],
          request: createMockTableIndexRequest({
            id: 1,
            index_name: "idx_animal_name",
            status: "create-pending",
            created_by: 1,
            last_executed_at: null,
          }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    const table = screen.getByRole("treegrid", { name: "Transform indexes" });
    for (const header of [
      "Name",
      "Type",
      "Columns",
      "Source",
      "Status",
      "Last modified by",
      "Last run",
    ]) {
      expect(
        within(table).getByRole("columnheader", {
          name: new RegExp(`^${header}`),
        }),
      ).toBeInTheDocument();
    }

    const indexNames = ["idx_animal_name", "idx_animal_score"];
    const getRowNames = () =>
      within(table)
        .getAllByRole("row")
        .map((row) =>
          indexNames.find((name) => row.textContent?.includes(name)),
        );

    expect(getRowNames()).toEqual(["idx_animal_name", "idx_animal_score"]);

    const pendingRow = within(table).getByRole("row", {
      name: /idx_animal_name/,
    });
    expect(within(pendingRow).getByText("idx_animal_name")).toBeInTheDocument();
    expect(within(pendingRow).getByText("B-Tree")).toBeInTheDocument();
    expect(within(pendingRow).getByText("name")).toBeInTheDocument();
    expect(within(pendingRow).getByText("Managed")).toBeInTheDocument();
    expect(within(pendingRow).getByText("Pending")).toBeInTheDocument();
    expect(
      await within(pendingRow).findByText("Bobby Tables"),
    ).toBeInTheDocument();
    expect(within(pendingRow).getByText("Never")).toBeInTheDocument();

    const removingRow = within(table).getByRole("row", {
      name: /idx_animal_score/,
    });
    expect(within(removingRow).getByText("score, name")).toBeInTheDocument();
    expect(within(removingRow).getByText("Removing")).toBeInTheDocument();
    expect(within(removingRow).queryByText("Never")).not.toBeInTheDocument();

    const nameHeader = within(table).getByRole("columnheader", {
      name: /^Name/,
    });
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(nameHeader);
    expect(
      within(table).getByRole("columnheader", { name: /^Name/ }),
    ).toHaveAttribute("aria-sort", "descending");
    expect(getRowNames()).toEqual(["idx_animal_score", "idx_animal_name"]);
  });

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

  it("shows the create index button", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByRole("button", { name: "Create index" }),
    ).toBeInTheDocument();
  });

  it("hides the create index button when remote sync is read-only", async () => {
    setup({ remoteSyncReadOnly: true });
    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByRole("button", { name: "Create index" }),
    ).not.toBeInTheDocument();
  });

  it("warns with the warehouse's own error when the indexes could not be read", async () => {
    const warehouseError =
      "Code: 497. DB::Exception: Not enough privileges. (ACCESS_DENIED)";
    setup({
      indexes: [createMockTableIndexEntry({ name: "idx_orders_id" })],
      warehouseError,
    });
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByText(
        `Metabase couldn't read the indexes on this table, so statuses may be out of date. The database said: ${warehouseError}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("idx_orders_id")).toBeInTheDocument();
  });

  it("does not claim the table has no indexes when the warehouse could not be read", async () => {
    setup({
      indexes: [],
      warehouseError:
        "Code: 497. DB::Exception: Not enough privileges. (ACCESS_DENIED)",
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("warehouse-error-banner")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Index the key columns of your transforms to make them faster and more efficient.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create index" }),
    ).toBeInTheDocument();
  });

  it("does not warn when the warehouse read succeeded", async () => {
    setup({ indexes: [createMockTableIndexEntry({ name: "idx_orders_id" })] });
    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByTestId("warehouse-error-banner"),
    ).not.toBeInTheDocument();
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
