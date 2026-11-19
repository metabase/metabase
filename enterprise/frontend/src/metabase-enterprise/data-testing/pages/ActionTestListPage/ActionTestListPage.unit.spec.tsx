import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupActionEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetActionTestEndpoint,
  setupListActionTestsEndpoint,
  setupRunActionTestEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { ActionTest } from "metabase-types/api";
import {
  createMockActionTest,
  createMockCollection,
  createMockDataTestEmptyExpectation,
  createMockDataTestRun,
  createMockDatabase,
  createMockQueryAction,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { ActionTestOverviewPage } from "../ActionTestOverviewPage";

import { ActionTestListPage } from "./ActionTestListPage";

const ACTION_ID = 42;

type SetupOpts = {
  tests?: ActionTest[];
  canRunNativeQueries?: boolean;
  hasActionsEnabled?: boolean;
};

function setup({
  tests = [],
  canRunNativeQueries = true,
  hasActionsEnabled = true,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({
      id: 1,
      native_permissions: canRunNativeQueries ? "write" : "none",
      settings: { "database-enable-actions": hasActionsEnabled },
    }),
  ]);
  setupActionEndpoints(
    createMockQueryAction({
      id: ACTION_ID,
      name: "Refund order",
      database_id: 1,
    }),
  );
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupListActionTestsEndpoint(tests);
  tests.forEach(setupGetActionTestEndpoint);

  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        "transforms-testing": true,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("data-testing");

  const { router } = renderWithProviders(
    <>
      <Route
        path="/data-studio/actions/:actionId/tests"
        element={<ActionTestListPage />}
      />
      <Route
        path="/data-studio/actions/:actionId/tests/:testId"
        element={<ActionTestOverviewPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute: Urls.dataStudioActionTestList(ACTION_ID),
      storeInitialState,
    },
  );
  return { router };
}

describe("ActionTestListPage", () => {
  it("lists the tests of the action with their checks and last run", async () => {
    setup({
      tests: [
        createMockActionTest({
          id: 1,
          action_id: ACTION_ID,
          name: "Refund marks only that order",
          expectations: [
            createMockDataTestEmptyExpectation({ name: "order 1 is refunded" }),
            createMockDataTestEmptyExpectation({ name: "order 2 is paid" }),
          ],
          last_run: createMockDataTestRun({
            test_type: "action",
            status: "passed",
          }),
        }),
        createMockActionTest({
          id: 2,
          action_id: ACTION_ID,
          name: "Refund keeps the total",
          last_run: createMockDataTestRun({
            id: 2,
            test_type: "action",
            status: "failed",
          }),
        }),
        createMockActionTest({
          id: 3,
          action_id: ACTION_ID,
          name: "Refund of a missing order",
        }),
      ],
    });

    const passedRow = await findRow("Refund marks only that order");
    expect(within(passedRow).getByText("2")).toBeInTheDocument();
    expect(within(passedRow).getByText(/Last run/)).toBeInTheDocument();

    const failedRow = await findRow("Refund keeps the total");
    expect(within(failedRow).getByText(/Failed/)).toBeInTheDocument();

    const neverRunRow = await findRow("Refund of a missing order");
    expect(
      within(neverRunRow).queryByText(/Last run|Failed/),
    ).not.toBeInTheDocument();
  });

  it("asks only for the tests of this action", async () => {
    setup();

    expect(await screen.findByText("No tests yet")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/ee/action-test", {
        method: "GET",
        query: { "action-id": String(ACTION_ID) },
      }),
    ).toBe(true);
  });

  it("shows the Tests tab of the action as selected", async () => {
    setup();

    expect(await screen.findByRole("tab", { name: "Tests" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("runs a test from the row menu and reloads the list", async () => {
    setup({
      tests: [
        createMockActionTest({ id: 1, action_id: ACTION_ID, name: "Refunds" }),
      ],
    });
    setupRunActionTestEndpoint(1, {
      status: "passed",
      expectations: [],
      tables: {},
    });

    const row = await findRow("Refunds");
    await userEvent.click(within(row).getByLabelText("Test options"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Run test/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/action-test/1/run", {
          method: "POST",
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/action-test", {
          method: "GET",
        }),
      ).toHaveLength(2);
    });
  });

  it("opens a test when its row is clicked", async () => {
    const { router } = setup({
      tests: [
        createMockActionTest({ id: 5, action_id: ACTION_ID, name: "Refunds" }),
      ],
    });

    await userEvent.click(await screen.findByText("Refunds"));

    expect(
      await screen.findByTestId("action-test-overview"),
    ).toBeInTheDocument();
    expect(router?.location.pathname).toBe(
      Urls.dataStudioActionTest(ACTION_ID, 5),
    );
  });

  it("links to the runs of a test from the row menu", async () => {
    setup({
      tests: [
        createMockActionTest({ id: 5, action_id: ACTION_ID, name: "Refunds" }),
      ],
    });

    const row = await findRow("Refunds");
    await userEvent.click(within(row).getByLabelText("Test options"));

    expect(
      await screen.findByRole("menuitem", { name: /View runs/ }),
    ).toHaveAttribute("href", Urls.dataStudioActionTestRuns(ACTION_ID, 5));
  });

  it("hides the row menu from users who can't run native queries on the database", async () => {
    setup({
      tests: [
        createMockActionTest({ id: 1, action_id: ACTION_ID, name: "Refunds" }),
      ],
      canRunNativeQueries: false,
    });

    const row = await findRow("Refunds");
    expect(
      within(row).queryByLabelText("Test options"),
    ).not.toBeInTheDocument();
  });

  it("hides the row menu when actions are disabled for the database", async () => {
    setup({
      tests: [
        createMockActionTest({ id: 1, action_id: ACTION_ID, name: "Refunds" }),
      ],
      hasActionsEnabled: false,
    });

    const row = await findRow("Refunds");
    expect(
      within(row).queryByLabelText("Test options"),
    ).not.toBeInTheDocument();
  });
});

function findRow(name: string) {
  return screen.findByRole("row", { name: new RegExp(name) });
}
