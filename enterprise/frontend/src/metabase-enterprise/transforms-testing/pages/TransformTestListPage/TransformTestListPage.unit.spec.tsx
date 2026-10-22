import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetTransformEndpoint,
  setupListTransformTestsEndpoint,
  setupRunTransformTestEndpoint,
  setupUserMetabotPermissionsEndpoint,
  setupUsersEndpoints,
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
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Transform, TransformTest } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
  createMockTransformTest,
  createMockTransformTestEmptyExpectation,
  createMockTransformTestEqualsExpectation,
  createMockTransformTestRun,
} from "metabase-types/api/mocks";

import { TransformTestListPage } from "./TransformTestListPage";

type SetupOpts = {
  transform?: Transform;
  tests?: TransformTest[];
  canWrite?: boolean;
};

function setup({
  transform = createMockTransform({ id: 1, name: "Customer revenue" }),
  tests = [],
  canWrite = true,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({
      id: 1,
      transforms_permissions: canWrite ? "write" : "none",
    }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupUserMetabotPermissionsEndpoint();
  setupUsersEndpoints([]);
  setupGetTransformEndpoint(transform);
  setupListTransformTestsEndpoint(tests);

  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        "transforms-testing": true,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("transforms-testing");

  const initialRoute = Urls.transformTestList(transform.id);
  const path = initialRoute.replace(`/${transform.id}/`, "/:transformId/");

  const { router } = renderWithProviders(
    <Route path={path} element={<TransformTestListPage />} />,
    { withRouter: true, initialRoute, storeInitialState },
  );
  return { router };
}

describe("TransformTestListPage", () => {
  it("lists the tests of the transform with their checks and last run", async () => {
    setup({
      tests: [
        createMockTransformTest({
          id: 1,
          name: "Refunded orders are excluded",
          expectations: [
            createMockTransformTestEqualsExpectation(),
            createMockTransformTestEmptyExpectation(),
          ],
          last_run: createMockTransformTestRun({ status: "passed" }),
        }),
        createMockTransformTest({
          id: 2,
          name: "Customers without paid orders are kept",
          last_run: createMockTransformTestRun({ id: 2, status: "failed" }),
        }),
        createMockTransformTest({ id: 3, name: "Country is always set" }),
      ],
    });

    const passedRow = await findRow("Refunded orders are excluded");
    expect(within(passedRow).getByText("2")).toBeInTheDocument();
    expect(within(passedRow).getByText(/Last run/)).toBeInTheDocument();

    const failedRow = await findRow("Customers without paid orders are kept");
    expect(within(failedRow).getByText(/Failed/)).toBeInTheDocument();

    const neverRunRow = await findRow("Country is always set");
    expect(
      within(neverRunRow).queryByText(/Last run|Failed/),
    ).not.toBeInTheDocument();
  });

  it("shows the Tests tab as selected", async () => {
    setup();

    expect(await screen.findByRole("link", { name: "Tests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows an empty state when the transform has no tests", async () => {
    setup({ tests: [] });

    expect(await screen.findByText("No tests yet")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_content, element) =>
          element?.textContent ===
          "Create tests with the mb CLI or with remote sync.",
      ),
    ).not.toHaveLength(0);
    expect(screen.getByText("mb", { selector: "code" })).toBeInTheDocument();
  });

  it("filters the tests by name", async () => {
    setup({
      tests: [
        createMockTransformTest({ id: 1, name: "Refunds" }),
        createMockTransformTest({ id: 2, name: "Countries" }),
      ],
    });

    await userEvent.type(
      await screen.findByPlaceholderText("Search..."),
      "count",
    );

    expect(screen.getByText("Countries")).toBeInTheDocument();
    expect(screen.queryByText("Refunds")).not.toBeInTheDocument();
  });

  it("runs a test from the row menu and reloads the list", async () => {
    setup({ tests: [createMockTransformTest({ id: 1, name: "Refunds" })] });
    setupRunTransformTestEndpoint(1, {
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
        fetchMock.callHistory.called("path:/api/ee/transform-test/1/run", {
          method: "POST",
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/transform-test", {
          method: "GET",
        }),
      ).toHaveLength(2);
    });
  });

  it("opens a test when its row is clicked", async () => {
    const { router } = setup({
      tests: [
        createMockTransformTest({ id: 5, transform_id: 1, name: "Refunds" }),
      ],
    });

    await userEvent.click(await screen.findByText("Refunds"));

    expect(router?.location.pathname).toBe(Urls.transformTest(1, 5));
  });

  it("links to the runs of a test from the row menu", async () => {
    setup({
      tests: [
        createMockTransformTest({ id: 5, transform_id: 1, name: "Refunds" }),
      ],
    });

    const row = await findRow("Refunds");
    await userEvent.click(within(row).getByLabelText("Test options"));

    expect(
      await screen.findByRole("menuitem", { name: /View runs/ }),
    ).toHaveAttribute("href", Urls.transformTestRuns(1, 5));
  });

  it("hides the row menu from users who can't edit the transform", async () => {
    setup({
      tests: [createMockTransformTest({ id: 1, name: "Refunds" })],
      canWrite: false,
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
