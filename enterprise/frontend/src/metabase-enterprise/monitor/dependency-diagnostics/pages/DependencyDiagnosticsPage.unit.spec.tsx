import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDependencyCountsEndpoint,
  setupListBreakingGraphNodesEndpoint,
  setupListUnreferencedGraphNodesEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  createMockDOMRect,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import type * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import type { DependencyDiagnosticsMode } from "metabase-enterprise/monitor/dependency-diagnostics/components/types";
import type {
  CardDependencyNode,
  CardType,
  Collection,
  DependencyDiagnosticsUserParams,
  DependencyNode,
} from "metabase-types/api";
import {
  createMockAnalysisFindingError,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCollection,
  createMockColumn,
  createMockDatabase,
  createMockField,
  createMockListBrokenGraphNodesResponse,
  createMockListUnreferencedGraphNodesResponse,
  createMockSegmentDependencyNode,
  createMockSegmentDependencyNodeData,
  createMockSnippetDependencyNode,
  createMockSnippetDependencyNodeData,
  createMockTable,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTransform,
  createMockUser,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./DependencyDiagnosticsPage";
import { getPageUrl } from "./utils";

const { trackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

const CARD_NODES = [
  createMockCardDependencyNode({
    id: 1,
    data: createMockCardDependencyNodeData({ name: "Question 1" }),
  }),
  createMockCardDependencyNode({
    id: 2,
    data: createMockCardDependencyNodeData({ name: "Question 2" }),
  }),
];

type SetupOpts = {
  mode?: DependencyDiagnosticsMode;
  nodes?: DependencyNode[];
  total?: number;
  urlParams?: Urls.DependencyDiagnosticsParams;
  lastUsedParams?: DependencyDiagnosticsUserParams;
};

function setup({
  mode = "broken",
  nodes = [],
  total,
  urlParams = {},
  lastUsedParams = {},
}: SetupOpts) {
  if (mode === "broken") {
    setupListBreakingGraphNodesEndpoint(
      createMockListBrokenGraphNodesResponse({
        data: nodes,
        total: total ?? nodes.length,
      }),
    );
  } else {
    setupListUnreferencedGraphNodesEndpoint(
      createMockListUnreferencedGraphNodesResponse({
        data: nodes,
        total: total ?? nodes.length,
      }),
    );
  }

  setupUserKeyValueEndpoints({
    namespace: "dependency_diagnostics",
    key: mode,
    value: lastUsedParams,
  });

  setupDependencyCountsEndpoint();
  mockGetBoundingClientRect({ width: 100, height: 100 });

  const PageComponent =
    mode === "broken"
      ? BrokenDependencyDiagnosticsPage
      : UnreferencedDependencyDiagnosticsPage;

  const { router } = renderWithProviders(
    <Route
      path={getPageUrl(mode, {})}
      element={
        <MonitorContent>
          <PageComponent />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      initialRoute: getPageUrl(mode, urlParams),
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );

  return { router };
}

function getFilterButton() {
  return screen.findByTestId("dependency-filter-button");
}

function getFilterPopover() {
  return screen.findByRole("dialog");
}

function getTypeCheckbox(popover: HTMLElement, name: string) {
  return within(popover).getByRole("checkbox", { name });
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

describe("DependencyDiagnosticsPage", () => {
  describe("list", () => {
    it("renders provided nodes in the list", async () => {
      setup({ nodes: CARD_NODES });

      const list = await screen.findByRole("treegrid");
      expect(await within(list).findByText("Question 1")).toBeInTheDocument();
      expect(await within(list).findByText("Question 2")).toBeInTheDocument();
    });

    it("renders selected row details in the Monitor sidebar outlet", async () => {
      setup({ nodes: CARD_NODES });

      const list = await screen.findByRole("treegrid");
      await userEvent.click(await within(list).findByText("Question 1"));

      const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
      expect(sidebarRegion).toHaveTextContent("Question 1");
    });
  });

  describe("URL parameters", () => {
    it("should set the group-types parameter when not all types are selected", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["table", "question", "model"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      await userEvent.click(getTypeCheckbox(popover, "Table"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        "group-types": ["question", "model"],
      });
    });

    it("should not set the group-types parameter when all types are selected", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["table", "question"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      await userEvent.click(getTypeCheckbox(popover, "Model"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
    });

    it("should set the include-personal-collections parameter when it is unchecked", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { includePersonalCollections: true },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      const checkbox = within(popover).getByRole("checkbox", {
        name: "Include items in personal collections",
      });
      await userEvent.click(checkbox);

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        "include-personal-collections": "false",
      });
    });

    it("should not set the include-personal-collections parameter when it is checked", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { includePersonalCollections: false },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      const checkbox = within(popover).getByRole("checkbox", {
        name: "Include items in personal collections",
      });
      await userEvent.click(checkbox);

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
    });

    it("should set the page parameter when navigating to the next page and it is not the first page", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        total: 50,
        urlParams: {},
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Next page"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        page: "1",
      });
    });

    it("should set the page parameter when navigating to the previous page and it is not the first page", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        total: 50,
        urlParams: { page: 2 },
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Previous page"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        page: "1",
      });
    });

    it("should not set the page parameter when it is the first page", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { page: 1 },
        total: 50,
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Previous page"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
    });
  });

  describe("last used params", () => {
    it("should use default filters when there are no query string or last used parameters", async () => {
      setup({
        nodes: CARD_NODES,
        urlParams: {},
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());

      const popover = await getFilterPopover();
      expect(getTypeCheckbox(popover, "Table")).toBeChecked();
      expect(getTypeCheckbox(popover, "Question")).toBeChecked();
      expect(getTypeCheckbox(popover, "Model")).toBeChecked();
    });

    it("should use last used parameters when there is no query string", async () => {
      setup({
        nodes: CARD_NODES,
        urlParams: {},
        lastUsedParams: { group_types: ["table"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());

      const popover = await getFilterPopover();
      expect(getTypeCheckbox(popover, "Table")).toBeChecked();
      expect(getTypeCheckbox(popover, "Question")).not.toBeChecked();
      expect(getTypeCheckbox(popover, "Model")).not.toBeChecked();
    });

    it("should use query string filters when there are no last used parameters", async () => {
      setup({
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["question"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());

      const popover = await getFilterPopover();
      expect(getTypeCheckbox(popover, "Table")).not.toBeChecked();
      expect(getTypeCheckbox(popover, "Question")).toBeChecked();
      expect(getTypeCheckbox(popover, "Model")).not.toBeChecked();
    });

    it("should use only query string values when both query string and last used parameters are provided", async () => {
      setup({
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["model"] },
        lastUsedParams: { group_types: ["table", "question"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());

      const popover = await getFilterPopover();
      expect(getTypeCheckbox(popover, "Table")).not.toBeChecked();
      expect(getTypeCheckbox(popover, "Question")).not.toBeChecked();
      expect(getTypeCheckbox(popover, "Model")).toBeChecked();
    });

    it("should update URL with last used parameters when there is no query string", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: {},
        lastUsedParams: { group_types: ["table", "question"] },
      });

      await waitForListToLoad();

      const currentLocation = router?.location;
      expect(parseSearchQuery(currentLocation?.search ?? "")).toEqual({
        "group-types": ["table", "question"],
      });
    });
  });
});

const BOBBY = createMockUserInfo({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
  email: "admin@metabase.test",
});

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
});
const FIRST_COLLECTION = createMockCollection({
  id: 2,
  name: "First collection",
});
const PERSONAL_COLLECTION = createMockCollection({
  id: 3,
  name: "Bobby Tables's Personal Collection",
  is_personal: true,
});
const SNIPPETS_COLLECTION = createMockCollection({
  id: "root",
  name: "SQL snippets",
  namespace: "snippets",
});

function createCardNode({
  id,
  name,
  cardType = "question",
  collection = ROOT_COLLECTION,
  ...opts
}: {
  id: number;
  name: string;
  cardType?: CardType;
  collection?: Collection;
} & Partial<Omit<CardDependencyNode, "id" | "type">>) {
  return createMockCardDependencyNode({
    id,
    data: createMockCardDependencyNodeData({
      name,
      type: cardType,
      collection,
      collection_id: collection.id === "root" ? null : Number(collection.id),
      dashboard: null,
      dashboard_id: null,
      creator: BOBBY,
    }),
    ...opts,
  });
}

function missingColumns(analyzedEntityId: number, columns: string[]) {
  return columns.map((column, index) =>
    createMockAnalysisFindingError({
      id: analyzedEntityId * 100 + index,
      analyzed_entity_id: analyzedEntityId,
      analyzed_entity_type: "card",
      error_type: "missing-column",
      error_detail: column,
    }),
  );
}

type ListRequestParams = {
  query?: string;
  "sort-column"?: string;
  "sort-direction"?: string;
  types: string[];
  "card-types": string[];
  "include-personal-collections"?: string;
};

function getListRequestParams(url: string): ListRequestParams {
  const searchParams = new URL(url, "http://localhost").searchParams;
  const params: ListRequestParams = {
    types: searchParams.getAll("types").sort(),
    "card-types": searchParams.getAll("card-types").sort(),
  };
  for (const key of [
    "query",
    "sort-column",
    "sort-direction",
    "include-personal-collections",
  ] as const) {
    const value = searchParams.get(key);
    if (value != null) {
      params[key] = value;
    }
  }
  return params;
}

function getNodeName(node: DependencyNode): string {
  if (node.type === "table") {
    return node.data.display_name;
  }
  return "name" in node.data ? node.data.name : "";
}

function isNodeOfTypes(node: DependencyNode, params: ListRequestParams) {
  if (!params.types.includes(node.type)) {
    return false;
  }
  return node.type !== "card" || params["card-types"].includes(node.data.type);
}

function isNodeInPersonalCollection(node: DependencyNode) {
  return node.type === "card" && node.data.collection?.is_personal === true;
}

type SortOrders = Record<string, string[]>;

/**
 * Stands in for the list endpoint: returns only the nodes that match the
 * request's search query, types and personal collections flag, in the order
 * that `sortOrders` gives for the requested `sort-column` and
 * `sort-direction` (`name-asc` when the request has no sort).
 */
function setupListEndpoint({
  mode,
  nodes,
  sortOrders,
}: {
  mode: DependencyDiagnosticsMode;
  nodes: DependencyNode[];
  sortOrders: SortOrders;
}) {
  const path =
    mode === "broken"
      ? "path:/api/ee/dependencies/graph/breaking"
      : "path:/api/ee/dependencies/graph/unreferenced";

  fetchMock.get(
    path,
    (call) => {
      const params = getListRequestParams(call.url);
      const sortKey =
        params["sort-column"] != null
          ? `${params["sort-column"]}-${params["sort-direction"]}`
          : "name-asc";
      const order = sortOrders[sortKey];
      if (order == null) {
        return { data: [], total: 0, limit: null, offset: null };
      }
      const query = params.query?.toLowerCase();
      const data = order
        .map((name) => nodes.find((node) => getNodeName(node) === name))
        .filter((node): node is DependencyNode => node != null)
        .filter((node) => isNodeOfTypes(node, params))
        .filter(
          (node) =>
            params["include-personal-collections"] !== "false" ||
            !isNodeInPersonalCollection(node),
        )
        .filter(
          (node) =>
            query == null || getNodeName(node).toLowerCase().includes(query),
        );
      return { data, total: data.length, limit: null, offset: null };
    },
    { name: `list-${mode}` },
  );
}

function getLastListRequestParams(mode: DependencyDiagnosticsMode) {
  const call = fetchMock.callHistory.lastCall(`list-${mode}`);
  return call != null ? getListRequestParams(call.url) : undefined;
}

/**
 * Stands in for the user key-value endpoints: a PUT stores the value, and the
 * next GET returns it, like the backend does across a page reload.
 */
function setupSavedListParamsEndpoints(mode: DependencyDiagnosticsMode) {
  const path = `path:/api/user-key-value/namespace/dependency_diagnostics/key/${mode}`;
  const state: { value: DependencyDiagnosticsUserParams | "" } = { value: "" };

  fetchMock.get(
    path,
    () =>
      new Response(JSON.stringify(state.value), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  fetchMock.put(
    path,
    (call) => {
      const body = JSON.parse(String(call.options.body));
      state.value = body.value;
      return { status: 200 };
    },
    { name: `put-params-${mode}` },
  );

  return state;
}

function getLastSavedListParams(mode: DependencyDiagnosticsMode) {
  const call = fetchMock.callHistory.lastCall(`put-params-${mode}`);
  return call != null ? JSON.parse(String(call.options.body)).value : undefined;
}

function setupFlow({
  mode,
  nodes,
  sortOrders,
  brokenDependents = {},
}: {
  mode: DependencyDiagnosticsMode;
  nodes: DependencyNode[];
  sortOrders: SortOrders;
  brokenDependents?: Record<string, DependencyNode[]>;
}) {
  setupListEndpoint({ mode, nodes, sortOrders });
  const savedParams = setupSavedListParamsEndpoints(mode);
  setupDependencyCountsEndpoint();
  fetchMock.get("path:/api/ee/dependencies/graph/broken", (call) => {
    const searchParams = new URL(call.url, "http://localhost").searchParams;
    const key = `${searchParams.get("type")}:${searchParams.get("id")}`;
    return brokenDependents[key] ?? [];
  });
  // The list is virtualized: give it room for every row, and give each row a
  // row height, so that all the rows of a fixture render.
  jest
    .spyOn(window.Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      const isRow =
        this.hasAttribute("data-index") || this.getAttribute("role") === "row";
      const height = isRow ? 40 : 1400;
      return createMockDOMRect({ width: 1600, height });
    });

  return { savedParams, render: () => renderPage(mode) };
}

function renderPage(mode: DependencyDiagnosticsMode) {
  const PageComponent =
    mode === "broken"
      ? BrokenDependencyDiagnosticsPage
      : UnreferencedDependencyDiagnosticsPage;

  return renderWithProviders(
    <Route
      path={getPageUrl(mode, {})}
      element={
        <MonitorContent>
          <PageComponent />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      initialRoute: getPageUrl(mode, {}),
      storeInitialState: { currentUser: createMockUser() },
    },
  );
}

function getList() {
  return screen.getByTestId("dependency-list");
}

async function expectListRows(names: string[]) {
  await waitFor(() => {
    const rows = within(getList()).queryAllByRole("row");
    expect(rows.map((row) => getRowName(row, names))).toEqual(names);
  });
}

function getRowName(row: HTMLElement, names: string[]) {
  return (
    names.find((name) => within(row).queryByText(name) != null) ??
    row.textContent
  );
}

async function expectListToHave({
  visible = [],
  hidden = [],
}: {
  visible?: string[];
  hidden?: string[];
}) {
  await waitFor(() => {
    for (const name of visible) {
      expect(within(getList()).getByText(name)).toBeInTheDocument();
    }
    for (const name of hidden) {
      expect(within(getList()).queryByText(name)).not.toBeInTheDocument();
    }
  });
}

async function clickHeader(name: string) {
  await userEvent.click(within(getList()).getByText(name));
}

async function search(mode: DependencyDiagnosticsMode, text: string) {
  const input = screen.getByTestId("dependency-list-search-input");
  await userEvent.clear(input);
  await userEvent.type(input, text);
  // The search is debounced: wait for its request, so that the list checks
  // that follow do not pass on the list from before the search.
  await waitFor(() => expect(getLastListRequestParams(mode)?.query).toBe(text));
}

async function openFilterPopover() {
  await userEvent.click(await getFilterButton());
  return getFilterPopover();
}

async function toggleFilter(popover: HTMLElement, name: string) {
  await userEvent.click(within(popover).getByRole("checkbox", { name }));
}

function getSidebar() {
  return screen.findByTestId("dependency-list-sidebar");
}

async function selectRow(name: string) {
  await userEvent.click(within(getList()).getByText(name));
  const sidebar = await getSidebar();
  await waitFor(() =>
    expect(
      within(sidebar).getByTestId("dependency-list-sidebar-header"),
    ).toHaveTextContent(name),
  );
  return sidebar;
}

type RenderedRouter = ReturnType<typeof renderPage>["router"];

function expectUrlSort(router: RenderedRouter, column: string, dir: string) {
  const search = parseSearchQuery(router?.location.search ?? "");
  expect(search["sort-column"]).toBe(column);
  expect(search["sort-direction"]).toBe(dir);
}

describe("DependencyDiagnosticsPage (list flows)", () => {
  afterEach(() => {
    trackSimpleEvent.mockClear();
    jest.restoreAllMocks();
  });

  describe("broken list", () => {
    const TRANSFORM_TABLE = "Test Transform Table";
    const TABLE_QUESTION = "Test Table-based question";
    const TABLE_MODEL = "Test Table-based model";

    const BROKEN_TABLE = createMockTableDependencyNode({
      id: 10,
      data: createMockTableDependencyNodeData({
        name: "test_transform_table",
        display_name: TRANSFORM_TABLE,
        db_id: 2,
        db: createMockDatabase({ id: 2, name: "Writable Postgres12" }),
        transform: createMockTransform({ id: 7, name: "Test Transform" }),
      }),
      dependents_errors: missingColumns(101, ["score"]),
    });
    const BROKEN_QUESTION = createCardNode({
      id: 20,
      name: TABLE_QUESTION,
      collection: PERSONAL_COLLECTION,
      dependents_errors: missingColumns(201, ["PRICE", "TAX", "DISCOUNT"]),
    });
    const BROKEN_MODEL = createCardNode({
      id: 30,
      name: TABLE_MODEL,
      cardType: "model",
      dependents_errors: [
        ...missingColumns(301, ["AMOUNT"]),
        ...missingColumns(302, ["QUANTITY", "SUBTOTAL", "TOTAL"]),
      ],
    });
    const NODES = [BROKEN_TABLE, BROKEN_QUESTION, BROKEN_MODEL];

    const BY_NAME = [TABLE_MODEL, TABLE_QUESTION, TRANSFORM_TABLE];
    const BY_LOCATION = [TABLE_QUESTION, TABLE_MODEL, TRANSFORM_TABLE];
    const BY_ERRORS = [TRANSFORM_TABLE, TABLE_QUESTION, TABLE_MODEL];
    const BY_DEPENDENTS_WITH_ERRORS = [
      TABLE_QUESTION,
      TABLE_MODEL,
      TRANSFORM_TABLE,
    ];
    const SORT_ORDERS: SortOrders = {
      "name-asc": BY_NAME,
      "name-desc": [...BY_NAME].reverse(),
      "location-asc": BY_LOCATION,
      "location-desc": [...BY_LOCATION].reverse(),
      "dependents-errors-asc": BY_ERRORS,
      "dependents-errors-desc": [...BY_ERRORS].reverse(),
      "dependents-with-errors-asc": BY_DEPENDENTS_WITH_ERRORS,
      "dependents-with-errors-desc": [...BY_DEPENDENTS_WITH_ERRORS].reverse(),
    };

    const DEFAULT_REQUEST = {
      types: ["card", "table"],
      "card-types": ["model", "question"],
      "include-personal-collections": "true",
    };

    function setupBroken() {
      return setupFlow({
        mode: "broken",
        nodes: NODES,
        sortOrders: SORT_ORDERS,
        brokenDependents: {
          "table:10": [
            createCardNode({ id: 101, name: "Broken expression question" }),
          ],
          "card:20": [
            createCardNode({ id: 201, name: "Question-based question" }),
          ],
          "card:30": [
            createCardNode({ id: 301, name: "Model-based question" }),
            createCardNode({
              id: 302,
              name: "Model-based model",
              cardType: "model",
            }),
          ],
        },
      });
    }

    it("should show the sidebar of the selected broken dependency", async () => {
      const { render } = setupBroken();
      render();
      await expectListRows(BY_NAME);

      let sidebar = await selectRow(TABLE_QUESTION);
      let missing = within(sidebar).getByRole("region", {
        name: "Missing columns",
      });
      for (const column of ["PRICE", "TAX", "DISCOUNT"]) {
        expect(within(missing).getByText(column)).toBeInTheDocument();
      }
      expect(
        await within(
          within(sidebar).getByRole("region", { name: "Broken dependents" }),
        ).findByText("Question-based question"),
      ).toBeInTheDocument();
      expect(
        fetchMock.callHistory.lastCall("path:/api/ee/dependencies/graph/broken")
          ?.url,
      ).toMatch(/id=20&type=card/);

      sidebar = await selectRow(TABLE_MODEL);
      missing = within(sidebar).getByRole("region", {
        name: "Missing columns",
      });
      for (const column of ["AMOUNT", "QUANTITY", "SUBTOTAL", "TOTAL"]) {
        expect(within(missing).getByText(column)).toBeInTheDocument();
      }
      const brokenDependents = within(sidebar).getByRole("region", {
        name: "Broken dependents",
      });
      expect(
        await within(brokenDependents).findByText("Model-based question"),
      ).toBeInTheDocument();
      expect(
        within(brokenDependents).getByText("Model-based model"),
      ).toBeInTheDocument();
      expect(
        within(brokenDependents).queryByText("Question-based question"),
      ).not.toBeInTheDocument();

      sidebar = await selectRow(TRANSFORM_TABLE);
      expect(
        within(within(sidebar).getByRole("region", { name: "Info" })).getByText(
          "Test Transform",
        ),
      ).toBeInTheDocument();
      expect(
        within(
          within(sidebar).getByRole("region", { name: "Missing columns" }),
        ).getByText("score"),
      ).toBeInTheDocument();
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "dependency_diagnostics_entity_selected",
        triggered_from: "broken",
        target_id: 10,
        event_detail: "table",
      });
    });

    it("should search broken dependencies", async () => {
      const { render } = setupBroken();
      render();
      await expectListRows(BY_NAME);

      await search("broken", TRANSFORM_TABLE);
      await expectListRows([TRANSFORM_TABLE]);
      expect(getLastListRequestParams("broken")).toEqual({
        ...DEFAULT_REQUEST,
        query: TRANSFORM_TABLE,
      });
      await expectListToHave({ hidden: [TABLE_QUESTION, TABLE_MODEL] });
    });

    it("should sort broken dependencies by every column and restore the sort after a reload", async () => {
      const { render } = setupBroken();
      const { router, unmount } = render();
      await expectListRows(BY_NAME);
      expect(getLastListRequestParams("broken")).toEqual(DEFAULT_REQUEST);

      const steps: [string, string, string, string[]][] = [
        ["Dependency", "name", "asc", BY_NAME],
        ["Dependency", "name", "desc", [...BY_NAME].reverse()],
        ["Location", "location", "asc", BY_LOCATION],
        ["Location", "location", "desc", [...BY_LOCATION].reverse()],
        ["Problems", "dependents-errors", "desc", [...BY_ERRORS].reverse()],
        ["Problems", "dependents-errors", "asc", BY_ERRORS],
        [
          "Broken dependents",
          "dependents-with-errors",
          "desc",
          [...BY_DEPENDENTS_WITH_ERRORS].reverse(),
        ],
        [
          "Broken dependents",
          "dependents-with-errors",
          "asc",
          BY_DEPENDENTS_WITH_ERRORS,
        ],
      ];
      for (const [header, column, direction, order] of steps) {
        await clickHeader(header);
        expectUrlSort(router, column, direction);
        await expectListRows(order);
        expect(getLastListRequestParams("broken")).toEqual({
          ...DEFAULT_REQUEST,
          "sort-column": column,
          "sort-direction": direction,
        });
        expect(getLastSavedListParams("broken")).toEqual({
          sort_column: column,
          sort_direction: direction,
        });
      }

      unmount();
      const { router: reloadedRouter } = renderPage("broken");
      await expectListRows(BY_DEPENDENTS_WITH_ERRORS);
      expectUrlSort(reloadedRouter, "dependents-with-errors", "asc");
      expect(getLastListRequestParams("broken")).toEqual({
        ...DEFAULT_REQUEST,
        "sort-column": "dependents-with-errors",
        "sort-direction": "asc",
      });
    });

    it("should filter broken dependencies by type and location and restore the filters after a reload", async () => {
      const { render } = setupBroken();
      const { unmount } = render();
      await expectListRows(BY_NAME);

      const popover = await openFilterPopover();
      await toggleFilter(popover, "Question");
      await toggleFilter(popover, "Model");
      await expectListToHave({
        visible: [TRANSFORM_TABLE],
        hidden: [TABLE_QUESTION, TABLE_MODEL],
      });
      expect(getLastListRequestParams("broken")).toEqual({
        ...DEFAULT_REQUEST,
        types: ["table"],
        "card-types": [],
      });

      await toggleFilter(popover, "Table");
      await toggleFilter(popover, "Question");
      await expectListToHave({
        visible: [TABLE_QUESTION],
        hidden: [TRANSFORM_TABLE, TABLE_MODEL],
      });
      expect(getLastListRequestParams("broken")).toEqual({
        ...DEFAULT_REQUEST,
        types: ["card"],
        "card-types": ["question"],
      });

      await toggleFilter(popover, "Question");
      await toggleFilter(popover, "Model");
      await expectListToHave({
        visible: [TABLE_MODEL],
        hidden: [TRANSFORM_TABLE, TABLE_QUESTION],
      });
      expect(getLastListRequestParams("broken")).toEqual({
        ...DEFAULT_REQUEST,
        types: ["card"],
        "card-types": ["model"],
      });

      await toggleFilter(popover, "Table");
      await toggleFilter(popover, "Question");
      // The default filters were requested on load, so the list comes from
      // the cache here, without a new request.
      await expectListRows(BY_NAME);

      await toggleFilter(popover, "Include items in personal collections");
      await expectListToHave({
        visible: [TRANSFORM_TABLE, TABLE_MODEL],
        hidden: [TABLE_QUESTION],
      });
      expect(getLastListRequestParams("broken")).toEqual({
        ...DEFAULT_REQUEST,
        "include-personal-collections": "false",
      });
      expect(getLastSavedListParams("broken")).toEqual({
        include_personal_collections: false,
      });

      unmount();
      renderPage("broken");
      await expectListToHave({
        visible: [TRANSFORM_TABLE, TABLE_MODEL],
        hidden: [TABLE_QUESTION],
      });
      expect(getLastListRequestParams("broken")).toEqual({
        ...DEFAULT_REQUEST,
        "include-personal-collections": "false",
      });
      const reloadedPopover = await openFilterPopover();
      expect(getTypeCheckbox(reloadedPopover, "Table")).toBeChecked();
      expect(getTypeCheckbox(reloadedPopover, "Question")).toBeChecked();
      expect(getTypeCheckbox(reloadedPopover, "Model")).toBeChecked();
      expect(
        getTypeCheckbox(
          reloadedPopover,
          "Include items in personal collections",
        ),
      ).not.toBeChecked();
    });

    it("should track opening the dependency graph from the broken list sidebar", async () => {
      const { render } = setupBroken();
      render();
      await expectListRows(BY_NAME);

      const sidebar = await selectRow(TABLE_MODEL);
      await userEvent.click(
        within(
          within(sidebar).getByTestId("dependency-list-sidebar-header"),
        ).getByRole("link", { name: "View in dependency graph" }),
      );
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "dependency_entity_selected",
        triggered_from: "diagnostics-broken-list",
        event_detail: "card",
        target_id: 30,
      });
    });
  });

  describe("unreferenced list", () => {
    const TABLE = "Many Data Types";
    const MODEL_QUESTION_SOURCE = "Model for question data source";
    const MODEL_MODEL_SOURCE = "Model for model data source";
    const MODEL_METRIC_SOURCE = "Model for metric data source";
    const MODEL_CARD_TAG = "Model for native question card tag";
    const MODEL_PARAMETER_SOURCE = "Model for native question parameter source";
    const MODEL_DASHBOARD_CARD = "Model for dashboard card";
    const MODEL_DASHBOARD_PARAMETER_SOURCE =
      "Model for dashboard parameter source";
    const SEGMENT_QUESTION_FILTER = "Segment for question filter";
    const SEGMENT_MODEL_FILTER = "Segment for model filter";
    const METRIC_QUESTION_AGGREGATION = "Metric for question aggregation";
    const METRIC_MODEL_AGGREGATION = "Metric for model aggregation";
    const SNIPPET_CARD_TAG = "Snippet for native question card tag";
    const SNIPPET_SNIPPET_TAG = "Snippet for snippet tag";

    const MODEL_NAMES = [
      MODEL_QUESTION_SOURCE,
      MODEL_MODEL_SOURCE,
      MODEL_METRIC_SOURCE,
      MODEL_CARD_TAG,
      MODEL_PARAMETER_SOURCE,
      MODEL_DASHBOARD_CARD,
      MODEL_DASHBOARD_PARAMETER_SOURCE,
    ];
    const SEGMENT_NAMES = [SEGMENT_QUESTION_FILTER, SEGMENT_MODEL_FILTER];
    const METRIC_NAMES = [
      METRIC_QUESTION_AGGREGATION,
      METRIC_MODEL_AGGREGATION,
    ];
    const SNIPPET_NAMES = [SNIPPET_CARD_TAG, SNIPPET_SNIPPET_TAG];

    const ORDERS_TABLE_ID = 2;
    const ORDERS_TABLE = createMockTable({
      id: ORDERS_TABLE_ID,
      db_id: 1,
      display_name: "Orders",
    });

    const NODES: DependencyNode[] = [
      createMockTableDependencyNode({
        id: 50,
        data: createMockTableDependencyNodeData({
          name: "many_data_types",
          display_name: TABLE,
          description: "This is a table with many data types",
          db_id: 2,
          db: createMockDatabase({ id: 2, name: "Writable Postgres12" }),
          owner: createMockUserInfo({
            id: 1,
            first_name: "Bobby",
            last_name: "Tables",
            email: "admin@metabase.test",
          }),
          fields: [
            createMockField({ id: 1, name: "id", display_name: "ID" }),
            createMockField({ id: 2, name: "uuid", display_name: "UUID" }),
          ],
        }),
      }),
      createCardNode({
        id: 1,
        name: MODEL_QUESTION_SOURCE,
        cardType: "model",
        data: createMockCardDependencyNodeData({
          name: MODEL_QUESTION_SOURCE,
          type: "model",
          collection: ROOT_COLLECTION,
          dashboard: null,
          creator: BOBBY,
          result_metadata: [
            createMockColumn({
              name: "USER_ID",
              display_name: "User ID",
            }),
          ],
        }),
      }),
      createCardNode({
        id: 2,
        name: MODEL_MODEL_SOURCE,
        cardType: "model",
        collection: FIRST_COLLECTION,
      }),
      createCardNode({
        id: 3,
        name: MODEL_METRIC_SOURCE,
        cardType: "model",
        collection: PERSONAL_COLLECTION,
      }),
      createCardNode({ id: 4, name: MODEL_CARD_TAG, cardType: "model" }),
      createCardNode({
        id: 5,
        name: MODEL_PARAMETER_SOURCE,
        cardType: "model",
      }),
      createCardNode({ id: 6, name: MODEL_DASHBOARD_CARD, cardType: "model" }),
      createCardNode({
        id: 7,
        name: MODEL_DASHBOARD_PARAMETER_SOURCE,
        cardType: "model",
      }),
      ...SEGMENT_NAMES.map((name, index) =>
        createMockSegmentDependencyNode({
          id: 10 + index,
          data: createMockSegmentDependencyNodeData({
            name,
            table_id: ORDERS_TABLE_ID,
            table: ORDERS_TABLE,
            creator: BOBBY,
          }),
        }),
      ),
      createCardNode({
        id: 20,
        name: METRIC_QUESTION_AGGREGATION,
        cardType: "metric",
      }),
      createCardNode({
        id: 21,
        name: METRIC_MODEL_AGGREGATION,
        cardType: "metric",
        collection: FIRST_COLLECTION,
      }),
      ...SNIPPET_NAMES.map((name, index) =>
        createMockSnippetDependencyNode({
          id: 30 + index,
          data: createMockSnippetDependencyNodeData({
            name,
            collection: SNIPPETS_COLLECTION,
            creator: BOBBY,
          }),
        }),
      ),
    ];

    const MODELS_BY_NAME = [...MODEL_NAMES].sort();
    const MODELS_BY_LOCATION = [
      MODEL_METRIC_SOURCE,
      MODEL_MODEL_SOURCE,
      MODEL_QUESTION_SOURCE,
      MODEL_CARD_TAG,
      MODEL_PARAMETER_SOURCE,
      MODEL_DASHBOARD_CARD,
      MODEL_DASHBOARD_PARAMETER_SOURCE,
    ];
    const ALL_BY_NAME = NODES.map(getNodeName).sort();
    const ALL_BY_LOCATION = [
      ...MODELS_BY_LOCATION,
      ...ALL_BY_NAME.filter((name) => !MODEL_NAMES.includes(name)),
    ];
    const SORT_ORDERS: SortOrders = {
      "name-asc": ALL_BY_NAME,
      "name-desc": [...ALL_BY_NAME].reverse(),
      "location-asc": ALL_BY_LOCATION,
      "location-desc": [...ALL_BY_LOCATION].reverse(),
    };

    const DEFAULT_REQUEST = {
      types: ["card", "measure", "segment", "snippet", "table"],
      "card-types": ["metric", "model", "question"],
      "include-personal-collections": "true",
    };

    function setupUnreferenced() {
      return setupFlow({
        mode: "unreferenced",
        nodes: NODES,
        sortOrders: SORT_ORDERS,
      });
    }

    function getSection(sidebar: HTMLElement, name: string) {
      return within(sidebar).getByRole("region", { name });
    }

    it("should show the sidebar of the selected unreferenced entity", async () => {
      const { render } = setupUnreferenced();
      render();
      await expectListToHave({ visible: [TABLE] });

      let sidebar = await selectRow(TABLE);
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "dependency_diagnostics_entity_selected",
        triggered_from: "unreferenced",
        target_id: 50,
        event_detail: "table",
      });
      expect(getSection(sidebar, "Location")).toHaveTextContent(
        "Writable Postgres12",
      );
      expect(getSection(sidebar, "Info")).toHaveTextContent(
        "This is a table with many data types",
      );
      expect(getSection(sidebar, "Info")).toHaveTextContent("Bobby Tables");
      const fields = getSection(sidebar, "Fields");
      expect(within(fields).getByText("ID")).toBeInTheDocument();
      expect(within(fields).getByText("UUID")).toBeInTheDocument();

      const cases: [string, string, string[]][] = [
        [MODEL_QUESTION_SOURCE, "Our analytics", ["User ID"]],
        [MODEL_MODEL_SOURCE, "First collection", []],
        [SEGMENT_QUESTION_FILTER, "Orders", []],
        [METRIC_QUESTION_AGGREGATION, "Our analytics", []],
        [METRIC_MODEL_AGGREGATION, "First collection", []],
        [SNIPPET_CARD_TAG, "SQL snippets", []],
      ];
      for (const [name, location, fieldNames] of cases) {
        sidebar = await selectRow(name);
        expect(getSection(sidebar, "Location")).toHaveTextContent(location);
        expect(getSection(sidebar, "Info")).toHaveTextContent("Bobby Tables");
        for (const fieldName of fieldNames) {
          expect(
            within(getSection(sidebar, "Fields")).getByText(fieldName),
          ).toBeInTheDocument();
        }
      }
    });

    it("should sort unreferenced entities and restore the sort after a reload", async () => {
      const { render } = setupUnreferenced();
      const { router, unmount } = render();
      await expectListToHave({ visible: [TABLE] });
      await search("unreferenced", "Model for");
      await expectListRows(MODELS_BY_NAME);
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "Model for",
      });

      const steps: [string, string, string, string[]][] = [
        ["Location", "location", "asc", MODELS_BY_LOCATION],
        ["Location", "location", "desc", [...MODELS_BY_LOCATION].reverse()],
        ["Name", "name", "asc", MODELS_BY_NAME],
        ["Name", "name", "desc", [...MODELS_BY_NAME].reverse()],
      ];
      for (const [header, column, direction, order] of steps) {
        await clickHeader(header);
        expectUrlSort(router, column, direction);
        await expectListRows(order);
        expect(getLastListRequestParams("unreferenced")).toEqual({
          ...DEFAULT_REQUEST,
          query: "Model for",
          "sort-column": column,
          "sort-direction": direction,
        });
        expect(getLastSavedListParams("unreferenced")).toEqual({
          sort_column: column,
          sort_direction: direction,
        });
      }

      unmount();
      renderPage("unreferenced");
      await expectListToHave({ visible: [TABLE] });
      await search("unreferenced", "Model for");
      await expectListRows([...MODELS_BY_NAME].reverse());
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "Model for",
        "sort-column": "name",
        "sort-direction": "desc",
      });
    });

    it("should search and filter unreferenced entities and restore the filters after a reload", async () => {
      const { render } = setupUnreferenced();
      const { unmount: unmountFirst } = render();
      await expectListToHave({ visible: [TABLE] });

      await search("unreferenced", "tag");
      await expectListToHave({
        visible: [MODEL_CARD_TAG, SNIPPET_SNIPPET_TAG],
        hidden: [MODEL_QUESTION_SOURCE],
      });
      let popover = await openFilterPopover();
      await toggleFilter(popover, "SQL snippet");
      await expectListToHave({
        visible: [MODEL_CARD_TAG],
        hidden: [SNIPPET_SNIPPET_TAG],
      });
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "tag",
        types: ["card", "measure", "segment", "table"],
      });
      expect(getLastSavedListParams("unreferenced")).toEqual({
        group_types: [
          "table",
          "question",
          "model",
          "metric",
          "segment",
          "measure",
        ],
      });

      unmountFirst();
      const { unmount: unmountSecond } = renderPage("unreferenced");
      await search("unreferenced", "for");
      await expectListToHave({
        visible: [...MODEL_NAMES, ...SEGMENT_NAMES, ...METRIC_NAMES],
        hidden: SNIPPET_NAMES,
      });
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "for",
        types: ["card", "measure", "segment", "table"],
      });

      popover = await openFilterPopover();
      await toggleFilter(popover, "SQL snippet");
      await expectListToHave({
        visible: [
          ...MODEL_NAMES,
          ...SEGMENT_NAMES,
          ...METRIC_NAMES,
          ...SNIPPET_NAMES,
        ],
      });

      await toggleFilter(popover, "Model");
      await expectListToHave({
        visible: [METRIC_QUESTION_AGGREGATION, SEGMENT_QUESTION_FILTER],
        hidden: MODEL_NAMES,
      });
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "for",
        "card-types": ["metric", "question"],
      });

      await toggleFilter(popover, "Segment");
      await expectListToHave({
        visible: [METRIC_QUESTION_AGGREGATION],
        hidden: [MODEL_CARD_TAG, SEGMENT_QUESTION_FILTER],
      });

      await toggleFilter(popover, "Metric");
      await expectListToHave({
        visible: [SNIPPET_CARD_TAG],
        hidden: [
          MODEL_CARD_TAG,
          SEGMENT_QUESTION_FILTER,
          METRIC_QUESTION_AGGREGATION,
        ],
      });
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "for",
        types: ["card", "measure", "snippet", "table"],
        "card-types": ["question"],
      });

      await toggleFilter(popover, "Model");
      await expectListToHave({
        visible: [
          MODEL_CARD_TAG,
          MODEL_MODEL_SOURCE,
          MODEL_METRIC_SOURCE,
          SNIPPET_CARD_TAG,
        ],
        hidden: [SEGMENT_QUESTION_FILTER, METRIC_QUESTION_AGGREGATION],
      });

      await toggleFilter(popover, "Include items in personal collections");
      await expectListToHave({
        visible: [MODEL_MODEL_SOURCE, SNIPPET_CARD_TAG],
        hidden: [MODEL_METRIC_SOURCE],
      });
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "for",
        types: ["card", "measure", "snippet", "table"],
        "card-types": ["model", "question"],
        "include-personal-collections": "false",
      });

      await toggleFilter(popover, "Include items in personal collections");
      await expectListToHave({
        visible: [MODEL_MODEL_SOURCE, MODEL_METRIC_SOURCE, SNIPPET_CARD_TAG],
      });
      expect(getLastSavedListParams("unreferenced")).toEqual({
        group_types: ["table", "question", "model", "measure", "snippet"],
      });

      unmountSecond();
      renderPage("unreferenced");
      await expectListToHave({ visible: [TABLE] });
      const reloadedPopover = await openFilterPopover();
      expect(getTypeCheckbox(reloadedPopover, "Model")).toBeChecked();
      expect(getTypeCheckbox(reloadedPopover, "Segment")).not.toBeChecked();
      expect(getTypeCheckbox(reloadedPopover, "Metric")).not.toBeChecked();
      await userEvent.keyboard("{Escape}");
      await search("unreferenced", "for");
      await expectListToHave({
        visible: [MODEL_CARD_TAG],
        hidden: [...SEGMENT_NAMES, ...METRIC_NAMES],
      });
      expect(getLastListRequestParams("unreferenced")).toEqual({
        ...DEFAULT_REQUEST,
        query: "for",
        types: ["card", "measure", "snippet", "table"],
        "card-types": ["model", "question"],
      });
    });

    it("should track opening the dependency graph from the unreferenced list sidebar", async () => {
      const { render } = setupUnreferenced();
      render();
      await expectListToHave({ visible: [SNIPPET_CARD_TAG] });

      const sidebar = await selectRow(SNIPPET_CARD_TAG);
      await userEvent.click(
        within(
          within(sidebar).getByTestId("dependency-list-sidebar-header"),
        ).getByRole("link", { name: "View in dependency graph" }),
      );
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "dependency_entity_selected",
        triggered_from: "diagnostics-unreferenced-list",
        event_detail: "snippet",
        target_id: 30,
      });
    });
  });
});
