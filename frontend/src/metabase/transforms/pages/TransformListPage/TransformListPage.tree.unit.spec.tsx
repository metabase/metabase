import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupListTransformsEndpoint,
  setupUserMetabotPermissionsEndpoint,
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
import type { Collection, Transform } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockTransform,
} from "metabase-types/api/mocks";

import { TransformListPage } from "./TransformListPage";

// This spec renders the real TreeTable (TransformListPage.unit.spec.tsx mocks it),
// so it covers the client-side search filter, folder expansion and column sorting.

type SetupOpts = {
  collections: Collection[];
  transforms: Transform[];
  delay?: number;
};

function setupCollectionsTreeEndpoint(
  collections: Collection[],
  delay?: number,
) {
  fetchMock.get(
    "path:/api/collection/tree",
    ({ url }) => {
      const params = new URL(url).searchParams;
      return params.get("namespace") === "transforms" ? collections : [];
    },
    { delay },
  );
}

async function setup({ collections, transforms, delay }: SetupOpts) {
  mockGetBoundingClientRect({ width: 1000, height: 40 });
  setupEnterprisePlugins();
  setupCollectionsTreeEndpoint(collections, delay);
  if (delay) {
    fetchMock.get("path:/api/transform", transforms, { delay });
  } else {
    setupListTransformsEndpoint(transforms);
  }
  setupDatabaseListEndpoint([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);
  setupUserMetabotPermissionsEndpoint();

  const state = createMockState({
    settings: mockSettings({
      "transforms-enabled": true,
      "token-features": createMockTokenFeatures({
        "transforms-basic": true,
        "transforms-python": true,
        advanced_permissions: true,
      }),
    }),
  });

  const path = "/transforms";
  renderWithProviders(<Route path={path} element={<TransformListPage />} />, {
    storeInitialState: state,
    withRouter: true,
    initialRoute: path,
  });

  await waitForLoaderToBeRemoved();
}

const getList = () => screen.getByTestId("transforms-list");

const getRowNames = () =>
  within(getList())
    .queryAllByTestId("tree-node-name")
    .map((node) => node.textContent?.trim());

const getSearchInput = () => screen.getByPlaceholderText("Search...");

describe("TransformListPage (tree table)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("search", () => {
    const ANALYTICS_ID = 11;
    const analytics = createMockCollection({
      id: ANALYTICS_ID,
      name: "Analytics",
      namespace: "transforms",
    });
    const transforms = [
      createMockTransform({
        id: 1,
        name: "Alpha Transform",
        collection_id: null,
        target: {
          type: "table",
          database: 1,
          schema: "public",
          name: "alpha_output",
        },
      }),
      createMockTransform({
        id: 2,
        name: "Beta Transform",
        collection_id: ANALYTICS_ID,
        target: {
          type: "table",
          database: 1,
          schema: "public",
          name: "beta_output",
        },
      }),
    ];

    it("filters transforms by name on the client", async () => {
      await setup({ collections: [analytics], transforms });
      expect(
        await within(getList()).findByText("Alpha Transform"),
      ).toBeInTheDocument();
      expect(within(getList()).getByText("Analytics")).toBeInTheDocument();

      await userEvent.type(getSearchInput(), "alpha");

      const rows = within(getList()).getAllByRole("row");
      expect(rows).toHaveLength(1);
      expect(within(rows[0]).getByText("Alpha Transform")).toBeInTheDocument();
      expect(
        within(getList()).queryByText("Beta Transform"),
      ).not.toBeInTheDocument();
      expect(
        within(getList()).queryByText("Analytics"),
      ).not.toBeInTheDocument();
      // The search is client-side: the list is not refetched with a query.
      expect(
        fetchMock.callHistory.calls("path:/api/transform", { method: "GET" }),
      ).toHaveLength(1);

      // "beta transform" only matches the name, not the output table.
      await userEvent.clear(getSearchInput());
      await userEvent.type(getSearchInput(), "beta transform");
      expect(getRowNames()).toEqual(["Analytics", "Beta Transform"]);
    });

    it("filters transforms by output table name and shows their collection", async () => {
      await setup({ collections: [analytics], transforms });
      expect(
        await within(getList()).findByText("Alpha Transform"),
      ).toBeInTheDocument();
      // Collapsed folder: its transform is not rendered before searching.
      expect(
        within(getList()).queryByText("Beta Transform"),
      ).not.toBeInTheDocument();

      await userEvent.type(getSearchInput(), "beta_output");

      expect(getRowNames()).toEqual(["Analytics", "Beta Transform"]);
      expect(
        within(getList()).queryByText("Alpha Transform"),
      ).not.toBeInTheDocument();

      await userEvent.clear(getSearchInput());
      expect(
        within(getList()).getByText("Alpha Transform"),
      ).toBeInTheDocument();
    });

    it("still filters when the data arrives late", async () => {
      await setup({ collections: [analytics], transforms, delay: 300 });
      expect(
        await within(getList()).findByText("Alpha Transform"),
      ).toBeInTheDocument();

      await userEvent.type(getSearchInput(), "beta_output");

      expect(getRowNames()).toEqual(["Analytics", "Beta Transform"]);
      expect(
        within(getList()).queryByText("Alpha Transform"),
      ).not.toBeInTheDocument();
    });
  });

  describe("collections", () => {
    it("shows a transform inside its collection after expanding it", async () => {
      const ANALYTICS_ID = 12;
      const analytics = createMockCollection({
        id: ANALYTICS_ID,
        name: "Analytics",
        namespace: "transforms",
      });
      await setup({
        collections: [
          createMockCollection({
            id: 13,
            name: "Other",
            namespace: "transforms",
          }),
          analytics,
        ],
        transforms: [
          createMockTransform({
            id: 5,
            name: "Analytics Transform",
            collection_id: ANALYTICS_ID,
          }),
        ],
      });

      expect(
        within(getList()).queryByText("Analytics Transform"),
      ).not.toBeInTheDocument();

      await userEvent.click(within(getList()).getByText("Analytics"));

      expect(getRowNames()).toEqual([
        "Other",
        "Analytics",
        "Analytics Transform",
        "Python library",
      ]);
    });
  });

  describe("sorting", () => {
    const REPORTS_ID = 21;
    const reports = createMockCollection({
      id: REPORTS_ID,
      name: "Reports",
      namespace: "transforms",
    });
    const transforms = [
      createMockTransform({
        id: 1,
        name: "Zebra Transform",
        collection_id: null,
        target: {
          type: "table",
          database: 1,
          schema: "public",
          name: "zebra_output",
        },
      }),
      createMockTransform({
        id: 2,
        name: "Alpha Transform",
        collection_id: REPORTS_ID,
        target: {
          type: "table",
          database: 1,
          schema: "public",
          name: "alpha_output",
        },
      }),
      createMockTransform({
        id: 3,
        name: "Middle Transform",
        collection_id: null,
        target: {
          type: "table",
          database: 1,
          schema: "public",
          name: "middle_output",
        },
      }),
    ];

    it("sorts transforms by name and output table in both directions", async () => {
      await setup({ collections: [reports], transforms });

      await userEvent.click(within(getList()).getByText("Reports"));
      expect(getRowNames()).toEqual([
        "Reports",
        "Alpha Transform",
        "Zebra Transform",
        "Middle Transform",
        "Python library",
      ]);

      await userEvent.click(within(getList()).getByText("Name"));
      expect(getRowNames()).toEqual([
        "Middle Transform",
        "Python library",
        "Reports",
        "Alpha Transform",
        "Zebra Transform",
      ]);

      await userEvent.click(within(getList()).getByText("Name"));
      expect(getRowNames()).toEqual([
        "Zebra Transform",
        "Reports",
        "Alpha Transform",
        "Python library",
        "Middle Transform",
      ]);

      await userEvent.click(within(getList()).getByText("Output table"));
      expect(getRowNames()).toEqual([
        "Reports",
        "Alpha Transform",
        "Python library",
        "Middle Transform",
        "Zebra Transform",
      ]);

      await userEvent.click(within(getList()).getByText("Output table"));
      expect(getRowNames()).toEqual([
        "Zebra Transform",
        "Middle Transform",
        "Reports",
        "Alpha Transform",
        "Python library",
      ]);
    });
  });
});
