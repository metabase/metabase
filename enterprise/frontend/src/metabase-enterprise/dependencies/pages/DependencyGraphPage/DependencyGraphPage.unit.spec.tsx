import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupDependencyGraphEndpoint,
  setupListDataAppsEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  CardType,
  DependencyEdge,
  DependencyNode,
  DependencyType,
  RecentItem,
  SearchResult,
} from "metabase-types/api";
import {
  createMockActionDependencyNode,
  createMockActionDependencyNodeData,
  createMockActionParameter,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCollection,
  createMockCollectionItem,
  createMockDependencyGraph,
  createMockMeasureDependencyNode,
  createMockMeasureDependencyNodeData,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
  createMockSearchResult,
  createMockSegmentDependencyNode,
  createMockSegmentDependencyNodeData,
  createMockSnippetDependencyNode,
  createMockSnippetDependencyNodeData,
  createMockTable,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTransformDependencyNode,
  createMockTransformDependencyNodeData,
} from "metabase-types/api/mocks";

import { DependencyGraphPage } from "./DependencyGraphPage";

registerVisualizations();

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const BASE_URL = "/data-studio/dependencies";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  name: "Our analytics",
  location: "",
});
const FIRST_COLLECTION = createMockCollection({
  id: 1,
  name: "First collection",
});
const SECOND_COLLECTION = createMockCollection({
  id: 2,
  name: "Second collection",
});
const PERSONAL_COLLECTION = createMockCollection({
  id: 3,
  name: "Bobby Tables's Personal Collection",
  is_personal: true,
  personal_owner_id: 1,
});
const DATA_ACTIONS_FOLDER_ID = 4;
const DATA_ACTIONS_FOLDER = createMockCollection({
  id: DATA_ACTIONS_FOLDER_ID,
  name: "Data actions folder",
  namespace: "data-actions",
  location: "/",
});

const SCOREBOARD_TABLE = createMockTable({
  id: 10,
  db_id: 2,
  schema: "public",
  name: "scoreboard_actions",
  display_name: "Scoreboard Actions",
});

function tableNode(
  id: number,
  displayName: string,
  dependentsCount: DependencyNode["dependents_count"] = {},
) {
  return createMockTableDependencyNode({
    id,
    data: createMockTableDependencyNodeData({
      name: displayName.toLowerCase().replace(/ /g, "_"),
      display_name: displayName,
      db_id: 2,
    }),
    dependents_count: dependentsCount,
  });
}

function cardNode(
  id: number,
  name: string,
  type: CardType,
  data: Partial<ReturnType<typeof createMockCardDependencyNodeData>> = {},
  dependentsCount: DependencyNode["dependents_count"] = {},
) {
  return createMockCardDependencyNode({
    id,
    data: createMockCardDependencyNodeData({
      name,
      type,
      display: type === "metric" ? "scalar" : "table",
      dashboard_id: null,
      collection_id: null,
      collection: ROOT_COLLECTION,
      ...data,
    }),
    dependents_count: dependentsCount,
  });
}

function transformNode(
  id: number,
  name: string,
  dependentsCount: DependencyNode["dependents_count"] = {},
) {
  return createMockTransformDependencyNode({
    id,
    data: createMockTransformDependencyNodeData({ name }),
    dependents_count: dependentsCount,
  });
}

function segmentNode(
  id: number,
  name: string,
  dependentsCount: DependencyNode["dependents_count"] = {},
) {
  return createMockSegmentDependencyNode({
    id,
    data: createMockSegmentDependencyNodeData({
      name,
      table_id: SCOREBOARD_TABLE.id,
      table: SCOREBOARD_TABLE,
    }),
    dependents_count: dependentsCount,
  });
}

function measureNode(
  id: number,
  name: string,
  dependentsCount: DependencyNode["dependents_count"] = {},
) {
  return createMockMeasureDependencyNode({
    id,
    data: createMockMeasureDependencyNodeData({
      name,
      table_id: SCOREBOARD_TABLE.id,
      table: SCOREBOARD_TABLE,
    }),
    dependents_count: dependentsCount,
  });
}

function snippetNode(
  id: number,
  name: string,
  dependentsCount: DependencyNode["dependents_count"] = {},
) {
  return createMockSnippetDependencyNode({
    id,
    data: createMockSnippetDependencyNodeData({ name }),
    dependents_count: dependentsCount,
  });
}

function actionNode(
  id: number,
  name: string,
  data: Partial<ReturnType<typeof createMockActionDependencyNodeData>> = {},
) {
  return createMockActionDependencyNode({
    id,
    data: createMockActionDependencyNodeData({
      name,
      collection_id: null,
      collection: null,
      ...data,
    }),
  });
}

const TABLE = tableNode(SCOREBOARD_TABLE.id, "Scoreboard Actions", {
  question: 6,
  model: 1,
  metric: 1,
  transform: 1,
  segment: 1,
  measure: 1,
  action: 1,
});

const QUESTION_IN_ROOT = cardNode(
  101,
  "Question in root collection",
  "question",
);
const QUESTION_IN_FIRST = cardNode(
  102,
  "Question in first collection",
  "question",
  { collection_id: 1, collection: FIRST_COLLECTION },
);
const QUESTION_IN_SECOND = cardNode(
  103,
  "Question in second collection",
  "question",
  { collection_id: 2, collection: SECOND_COLLECTION },
);
const QUESTION_IN_PERSONAL = cardNode(
  104,
  "Question in personal collection",
  "question",
  { collection_id: 3, collection: PERSONAL_COLLECTION },
);
const QUESTION_IN_DASHBOARD = cardNode(
  105,
  "Question in dashboard",
  "question",
  { dashboard_id: 1, dashboard: { id: 1, name: "Dashboard" } },
);
const QUESTION_IN_DOCUMENT = cardNode(106, "Question in document", "question", {
  document_id: 1,
  document: { id: 1, name: "Document" },
});

const TABLE_BASED_QUESTION = cardNode(
  40,
  "Table-based question",
  "question",
  {},
  { question: 1, model: 1, metric: 1, transform: 1, snippet: 1 },
);
const TABLE_BASED_MODEL = cardNode(
  107,
  "Table-based model",
  "model",
  {},
  { question: 1, model: 1, metric: 1, transform: 1, snippet: 1 },
);
const TABLE_BASED_METRIC = cardNode(
  108,
  "Table-based metric",
  "metric",
  {},
  { question: 1, model: 1, metric: 1, transform: 1 },
);
const TABLE_BASED_SEGMENT = segmentNode(30, "Table-based segment", {
  question: 1,
  model: 1,
  measure: 1,
  metric: 1,
  segment: 1,
});
const TABLE_BASED_MEASURE = measureNode(50, "Table-based measure", {
  question: 1,
  model: 1,
  metric: 1,
  transform: 1,
  measure: 1,
});
const TABLE_BASED_TRANSFORM = transformNode(70, "Table-based transform", {
  table: 1,
});
const TRANSFORM_TABLE = tableNode(11, "Transform Table");
const TABLE_BASED_ACTION = actionNode(80, "Table-based data action");
const EMPTY_SNIPPET = snippetNode(60, "Empty snippet", {
  question: 1,
  model: 1,
  transform: 1,
  snippet: 1,
  action: 1,
});

const SNIPPET_BASED_SNIPPET = snippetNode(63, "Snippet-based snippet");

const FOLDER_ACTION = actionNode(82, "Table-based data action", {
  collection_id: DATA_ACTIONS_FOLDER_ID,
  collection: DATA_ACTIONS_FOLDER,
  parameters: [
    createMockActionParameter({
      id: "team_id",
      slug: "team_id",
      name: "Team ID",
      type: "number/=",
      target: ["variable", ["template-tag", "team_id"]],
      required: true,
    }),
  ],
});
const FOLDER_ACTION_TABLE = tableNode(
  SCOREBOARD_TABLE.id + 2,
  "Scoreboard Actions",
  {
    action: 1,
  },
);

function cardBasedDependents(prefix: string, firstId: number) {
  return [
    cardNode(firstId, `${prefix} question`, "question"),
    cardNode(firstId + 1, `${prefix} model`, "model"),
    cardNode(firstId + 2, `${prefix} metric`, "metric"),
    transformNode(firstId + 3, `${prefix} transform`),
    snippetNode(firstId + 4, `${prefix} snippet`),
  ];
}

// Maps each node to the nodes that use it, which the dependents endpoint returns
const DEPENDENTS = new Map<DependencyNode, DependencyNode[]>([
  [
    TABLE,
    [
      QUESTION_IN_DASHBOARD,
      QUESTION_IN_DOCUMENT,
      QUESTION_IN_ROOT,
      QUESTION_IN_FIRST,
      QUESTION_IN_SECOND,
      QUESTION_IN_PERSONAL,
      TABLE_BASED_MODEL,
      TABLE_BASED_METRIC,
      TABLE_BASED_TRANSFORM,
      TABLE_BASED_SEGMENT,
      TABLE_BASED_MEASURE,
      TABLE_BASED_ACTION,
    ],
  ],
  [TABLE_BASED_TRANSFORM, [TRANSFORM_TABLE]],
  [
    TABLE_BASED_SEGMENT,
    [
      cardNode(301, "Segment-based question", "question"),
      cardNode(302, "Segment-based model", "model"),
      cardNode(303, "Segment-based metric", "metric"),
      measureNode(31, "Segment-based measure"),
      segmentNode(32, "Segment-based segment"),
    ],
  ],
  [TABLE_BASED_QUESTION, cardBasedDependents("Question-based", 401)],
  [TABLE_BASED_MODEL, cardBasedDependents("Model-based", 411)],
  [
    TABLE_BASED_MEASURE,
    [
      cardNode(501, "Measure-based question", "question"),
      cardNode(502, "Measure-based model", "model"),
      cardNode(503, "Measure-based metric", "metric"),
      transformNode(504, "Measure-based transform"),
      measureNode(51, "Measure-based measure"),
    ],
  ],
  [
    TABLE_BASED_METRIC,
    [
      cardNode(601, "Metric-based question", "question"),
      cardNode(602, "Metric-based model", "model"),
      cardNode(603, "Metric-based metric", "metric"),
      transformNode(604, "Metric-based transform"),
    ],
  ],
  [
    EMPTY_SNIPPET,
    [
      cardNode(701, "Snippet-based question", "question"),
      cardNode(702, "Snippet-based model", "model"),
      transformNode(703, "Snippet-based transform"),
      SNIPPET_BASED_SNIPPET,
      actionNode(81, "Snippet-based data action"),
    ],
  ],
  [FOLDER_ACTION_TABLE, [FOLDER_ACTION]],
]);

// Search results that lead to graph entries. Products is a table, the other ones are cards.
const PRODUCTS_TABLE = tableNode(1, "Products");
const ORDERS_COUNT_QUESTION = cardNode(
  2,
  "Orders, Count, Grouped by Created At (year)",
  "question",
  { display: "line" },
);
const ORDERS_MODEL = cardNode(3, "Orders Model", "model");

const ENTRY_NODES = [
  TABLE,
  TABLE_BASED_QUESTION,
  EMPTY_SNIPPET,
  FOLDER_ACTION_TABLE,
  PRODUCTS_TABLE,
  ORDERS_COUNT_QUESTION,
  ORDERS_MODEL,
];

function getNodeKey(id: number | string, type: string) {
  return `${type}-${id}`;
}

function getAllNodes() {
  return [...ENTRY_NODES, ...Array.from(DEPENDENTS.values()).flat()];
}

function findNodeByEntry(id: number, type: string | null) {
  return getAllNodes().find(
    (node) => getNodeKey(node.id, node.type) === getNodeKey(id, type),
  );
}

// The question is not in the dependents of the table, so that the table keeps 6 questions
const EXTRA_UPSTREAM_NODES = new Map<DependencyNode, DependencyNode[]>([
  [TABLE_BASED_QUESTION, [TABLE]],
]);

function findUpstreamNodes(node: DependencyNode) {
  return [
    ...(EXTRA_UPSTREAM_NODES.get(node) ?? []),
    ...Array.from(DEPENDENTS.entries())
      .filter(([, dependents]) => dependents.includes(node))
      .map(([parent]) => parent),
  ];
}

function isInPersonalCollection(node: DependencyNode) {
  return node.type === "card" && node.data.collection?.is_personal === true;
}

const SEARCH_RESULTS: SearchResult[] = [
  createMockSearchResult({ id: 1, name: "Products", model: "table" }),
  createMockSearchResult({
    id: 2,
    name: "Orders, Count, Grouped by Created At (year)",
    model: "card",
    display: "line",
  }),
  createMockSearchResult({
    id: 3,
    name: "Orders Model",
    model: "dataset",
  }),
  createMockSearchResult({
    id: TABLE_BASED_METRIC.id,
    name: "Table-based metric",
    model: "metric",
  }),
  createMockSearchResult({
    id: TABLE_BASED_TRANSFORM.id,
    name: "Table-based transform",
    model: "transform",
  }),
  createMockSearchResult({
    id: TABLE_BASED_MODEL.id,
    name: "Table-based model",
    model: "dataset",
  }),
];

function getRecentItem(model: string, id: number): RecentItem | undefined {
  const result = SEARCH_RESULTS.find(
    (result) => result.model === model && result.id === id,
  );
  switch (result?.model) {
    case "table":
      return createMockRecentTableItem({
        id,
        name: result.name.toLowerCase(),
        display_name: result.name,
      });
    case "card":
    case "dataset":
    case "metric":
      return createMockRecentCollectionItem({
        id,
        name: result.name,
        model: result.model,
        display: result.display ?? "table",
      });
    default:
      return undefined;
  }
}

function setupGraphEndpoints() {
  fetchMock.get("path:/api/ee/dependencies/graph", (call) => {
    const params = new URL(call.url).searchParams;
    const node = findNodeByEntry(Number(params.get("id")), params.get("type"));
    if (node == null) {
      return { status: 404 };
    }
    const upstreamNodes = findUpstreamNodes(node);
    const edges: DependencyEdge[] = upstreamNodes.map((upstreamNode) => ({
      from_entity_id: node.id,
      from_entity_type: node.type,
      to_entity_id: upstreamNode.id,
      to_entity_type: upstreamNode.type,
    }));
    return createMockDependencyGraph({
      nodes: [node, ...upstreamNodes],
      edges,
    });
  });

  fetchMock.get("path:/api/ee/dependencies/graph/dependents", (call) => {
    const params = new URL(call.url).searchParams;
    const node = findNodeByEntry(Number(params.get("id")), params.get("type"));
    const dependentTypes = params.getAll("dependent-types");
    const dependentCardTypes = params.getAll("dependent-card-types");
    const includePersonal =
      params.get("include-personal-collections") === "true";
    const dependents = node != null ? (DEPENDENTS.get(node) ?? []) : [];

    return dependents.filter(
      (dependent) =>
        dependentTypes.includes(dependent.type) &&
        (dependent.type !== "card" ||
          dependentCardTypes.includes(dependent.data.type)) &&
        (includePersonal || !isInPersonalCollection(dependent)),
    );
  });
}

function setupSearchAndRecentsEndpoints() {
  const recentItems: RecentItem[] = [];

  fetchMock.get("path:/api/search", (call) => {
    const params = new URL(call.url).searchParams;
    const query = params.get("q")?.toLowerCase() ?? "";
    const models = params.getAll("models");
    const isDependencySearch = params.get("context") === "dependencies";
    const data = isDependencySearch
      ? SEARCH_RESULTS.filter(
          (result) =>
            models.includes(result.model) &&
            result.name.toLowerCase().includes(query),
        )
      : [];
    return { data, total: data.length, models, available_models: models };
  });

  fetchMock.get("path:/api/activity/recents", (call) => {
    const params = new URL(call.url).searchParams;
    const isSelections = params.getAll("context").includes("selections");
    return { recents: isSelections ? [...recentItems].reverse() : [] };
  });

  fetchMock.post("path:/api/activity/recents", async (call) => {
    const body = JSON.parse(String(call.options.body));
    const recentItem = getRecentItem(body.model, body.model_id);
    if (body.context === "selection" && recentItem != null) {
      recentItems.push(recentItem);
    }
    return { status: 200 };
  });
}

function setup({ entry }: { entry?: DependencyNode } = {}) {
  setupGraphEndpoints();
  setupSearchAndRecentsEndpoints();

  const initialRoute =
    entry != null ? `${BASE_URL}?id=${entry.id}&type=${entry.type}` : BASE_URL;
  const { router } = renderWithProviders(
    <Route path={BASE_URL} element={<DependencyGraphPage />} />,
    { withRouter: true, initialRoute },
  );

  return { router: router! };
}

function getGraph() {
  return screen.getByTestId("dependency-graph");
}

function getGraphNodes() {
  return within(getGraph()).getAllByTestId("graph-node");
}

async function findGraphNode(label: string) {
  return waitFor(() => {
    const node = getGraphNodes().find(
      (node) => node.getAttribute("aria-label") === label,
    );
    expect(node).toBeDefined();
    return node!;
  });
}

function getEntryButton() {
  return screen.getByTestId("graph-entry-button");
}

async function findEntryButton(label: string) {
  return waitFor(() => {
    const button = getEntryButton();
    expect(button).toHaveTextContent(label);
    return button;
  });
}

function getDependencyPanel() {
  return screen.getByTestId("graph-dependency-panel");
}

async function findPanelItem(label: string) {
  return waitFor(() =>
    within(getDependencyPanel()).getByRole("generic", { name: label }),
  );
}

async function clickDependentGroup(nodeLabel: string, groupLabel: string) {
  const node = await findGraphNode(nodeLabel);
  // xyflow's drag handler on nodes needs a pointer event `view`, which user-event
  // does not provide in jsdom
  fireEvent.click(within(node).getByText(groupLabel));
}

function getLastGraphRequestParams() {
  const call = fetchMock.callHistory.lastCall(
    "path:/api/ee/dependencies/graph",
  );
  return Object.fromEntries(new URL(call!.url).searchParams.entries());
}

function getLastDependentsRequestParams() {
  const call = fetchMock.callHistory.lastCall(
    "path:/api/ee/dependencies/graph/dependents",
  );
  const params = new URL(call!.url).searchParams;
  return {
    id: params.get("id"),
    type: params.get("type"),
    "dependent-types": params.getAll("dependent-types"),
    "dependent-card-types": params.getAll("dependent-card-types"),
    "include-personal-collections": params.get("include-personal-collections"),
  };
}

type PanelNavigationOpts = {
  router: ReturnType<typeof setup>["router"];
  item: DependencyNode;
  itemLabel?: string;
  groupLabel: string;
  dependent: DependencyNode;
  dependentLabel?: string;
  dependentLocation?: string;
};

async function verifyPanelNavigation({
  router,
  item,
  itemLabel = getLabel(item),
  groupLabel,
  dependent,
  dependentLabel = getLabel(dependent),
  dependentLocation,
}: PanelNavigationOpts) {
  await clickDependentGroup(itemLabel, groupLabel);
  const panelItem = await findPanelItem(dependentLabel);
  expect(getLastDependentsRequestParams()).toMatchObject({
    id: String(item.id),
    type: item.type,
  });
  if (dependentLocation != null) {
    expect(within(panelItem).getByText(dependentLocation)).toBeInTheDocument();
  }
  await userEvent.click(within(panelItem).getByText(dependentLabel));
  await findEntryButton(dependentLabel);
  expect(getLastGraphRequestParams()).toEqual({
    id: String(dependent.id),
    type: dependent.type,
  });

  act(() => router.back());
  await findEntryButton(itemLabel);
}

async function findOption(label: string) {
  return waitFor(() => {
    const option = screen
      .getAllByRole("option")
      .find((option) => option.textContent?.trim() === label);
    expect(option).toBeDefined();
    return option!;
  });
}

function getLabel(node: DependencyNode) {
  switch (node.type) {
    case "table":
      return node.data.display_name;
    case "sandbox":
      throw new Error("Sandboxes are not used in this spec");
    default:
      return node.data.name;
  }
}

describe("DependencyGraphPage", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("should show an app switcher if there is no context", async () => {
    setupDependencyGraphEndpoint(createMockDependencyGraph());
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    renderWithProviders(<Route path="/" element={<DependencyGraphPage />} />, {
      withRouter: true,
    });

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(screen.getByTestId("app-switcher-target")).toBeInTheDocument();
  });

  it("should not show an app switcher if the context contains a base url", async () => {
    setupDependencyGraphEndpoint(createMockDependencyGraph());
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    renderWithProviders(
      <Route
        path="/"
        element={
          <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
            value={{
              baseUrl: "any-url",
              defaultEntry: { id: 2, type: "transform" },
            }}
          >
            <DependencyGraphPage />
          </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
        }
      />,
      {
        withRouter: true,
      },
    );

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(screen.queryByTestId("app-switcher-target")).not.toBeInTheDocument();
  });

  describe("entity search", () => {
    async function selectViaInlineSearch({
      node,
      icon,
      eventDetail,
    }: {
      node: DependencyNode;
      icon: string;
      eventDetail: DependencyType;
    }) {
      const label = getLabel(node);
      await userEvent.type(
        screen.getByPlaceholderText("Pick an item to see its dependencies"),
        label,
      );
      await userEvent.click(await findOption(label));

      const entryButton = await findEntryButton(label);
      expect(
        within(entryButton).getByLabelText(`${icon} icon`),
      ).toBeInTheDocument();
      expect(getLastGraphRequestParams()).toEqual({
        id: String(node.id),
        type: node.type,
      });
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dependency_entity_selected",
        triggered_from: "dependency-graph",
        event_detail: eventDetail,
        target_id: node.id,
      });
      return entryButton;
    }

    it.each<{
      node: DependencyNode;
      icon: string;
      eventDetail: DependencyType;
    }>([
      { node: PRODUCTS_TABLE, icon: "table", eventDetail: "table" },
      { node: ORDERS_COUNT_QUESTION, icon: "line", eventDetail: "card" },
      { node: ORDERS_MODEL, icon: "model", eventDetail: "card" },
      { node: TABLE_BASED_METRIC, icon: "metric", eventDetail: "card" },
    ])(
      "should find $node.type $node.id via inline search, open its graph, and show it in recent items",
      async ({ node, icon, eventDetail }) => {
        setup();
        const entryButton = await selectViaInlineSearch({
          node,
          icon,
          eventDetail,
        });

        await userEvent.click(within(entryButton).getByLabelText("Remove"));
        await userEvent.click(
          await screen.findByPlaceholderText(
            "Pick an item to see its dependencies",
          ),
        );
        expect(await findOption(getLabel(node))).toBeInTheDocument();
      },
    );

    it("should find a transform via inline search and open its graph", async () => {
      setup();
      const entryButton = await selectViaInlineSearch({
        node: TABLE_BASED_TRANSFORM,
        icon: "transform",
        eventDetail: "transform",
      });
      expect(entryButton).toHaveTextContent("Table-based transform");
    });
  });

  describe("entity picker", () => {
    function setupPickerEndpoints() {
      mockGetBoundingClientRect();
      setupDatabasesEndpoints([]);
      setupListDataAppsEndpoint([]);
      fetchMock.get("path:/api/collection/root", (call) => ({
        ...ROOT_COLLECTION,
        namespace: new URL(call.url).searchParams.get("namespace"),
      }));
      fetchMock.get("path:/api/collection/root/items", (call) => {
        const namespace = new URL(call.url).searchParams.get("namespace");
        const data =
          namespace === "snippets"
            ? [
                createMockCollectionItem({
                  id: EMPTY_SNIPPET.id,
                  model: "snippet",
                  name: "Empty snippet",
                  collection_id: null,
                }),
                createMockCollectionItem({
                  id: SNIPPET_BASED_SNIPPET.id,
                  model: "snippet",
                  name: "Snippet-based snippet",
                  collection_id: null,
                }),
              ]
            : [];
        return {
          data,
          total: data.length,
          models: [],
          limit: null,
          offset: null,
        };
      });
      setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
      setupCollectionItemsEndpoint({
        collection: PERSONAL_COLLECTION,
        collectionItems: [],
      });
      fetchMock.get(
        `path:/api/native-query-snippet/${SNIPPET_BASED_SNIPPET.id}`,
        {
          id: SNIPPET_BASED_SNIPPET.id,
          name: "Snippet-based snippet",
          collection_id: null,
        },
      );
    }

    it("should pick an entry in the entity picker, open its graph, and select it when the picker is opened again", async () => {
      setupPickerEndpoints();
      setup();

      await userEvent.click(
        screen.getByPlaceholderText("Pick an item to see its dependencies"),
      );
      await userEvent.click(await findOption("Browse all"));
      const modal = await screen.findByRole("dialog");
      await userEvent.click(
        await within(modal).findByRole("link", { name: /SQL Snippets/ }),
      );
      await userEvent.click(
        await within(modal).findByRole("link", {
          name: /Snippet-based snippet/,
        }),
      );

      const entryButton = await findEntryButton("Snippet-based snippet");
      expect(
        within(entryButton).getByLabelText("snippet icon"),
      ).toBeInTheDocument();
      expect(getLastGraphRequestParams()).toEqual({
        id: String(SNIPPET_BASED_SNIPPET.id),
        type: "snippet",
      });
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dependency_entity_selected",
        triggered_from: "dependency-graph",
        event_detail: "snippet",
        target_id: SNIPPET_BASED_SNIPPET.id,
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await userEvent.click(entryButton);
      const reopenedModal = await screen.findByRole("dialog");
      await waitFor(() => {
        expect(
          within(reopenedModal).getByRole("link", {
            name: /Snippet-based snippet/,
          }),
        ).toHaveAttribute("data-active", "true");
      });
      await userEvent.click(within(reopenedModal).getByLabelText("Close"));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(getEntryButton()).toHaveTextContent("Snippet-based snippet");
    });
  });

  describe("dependent types", () => {
    it("should display the dependents of a table, filter them, and navigate to them", async () => {
      const { router } = setup({ entry: TABLE });

      await clickDependentGroup("Scoreboard Actions", "6 questions");
      for (const question of [
        QUESTION_IN_DASHBOARD,
        QUESTION_IN_DOCUMENT,
        QUESTION_IN_ROOT,
        QUESTION_IN_FIRST,
        QUESTION_IN_SECOND,
        QUESTION_IN_PERSONAL,
      ]) {
        expect(await findPanelItem(getLabel(question))).toBeInTheDocument();
      }
      expect(getLastDependentsRequestParams()).toEqual({
        id: String(TABLE.id),
        type: "table",
        "dependent-types": ["card"],
        "dependent-card-types": ["question"],
        "include-personal-collections": "true",
      });
      expect(
        within(await findPanelItem("Question in root collection")).getByText(
          "Our analytics",
        ),
      ).toBeInTheDocument();
      expect(
        within(await findPanelItem("Question in first collection")).getByText(
          "First collection",
        ),
      ).toBeInTheDocument();
      expect(
        within(await findPanelItem("Question in dashboard")).getByText(
          "Dashboard",
        ),
      ).toBeInTheDocument();
      expect(
        within(await findPanelItem("Question in document")).getByText(
          "Document",
        ),
      ).toBeInTheDocument();

      await userEvent.click(
        within(getDependencyPanel()).getByRole("button", { name: "Filter" }),
      );
      await userEvent.click(
        await screen.findByText("Include items in personal collections"),
      );
      await waitForElementToBeRemoved(() =>
        within(getDependencyPanel()).queryByRole("generic", {
          name: "Question in personal collection",
        }),
      );
      expect(getLastDependentsRequestParams()).toEqual({
        id: String(TABLE.id),
        type: "table",
        "dependent-types": ["card"],
        "dependent-card-types": ["question"],
        "include-personal-collections": "false",
      });
      for (const question of [
        QUESTION_IN_DASHBOARD,
        QUESTION_IN_DOCUMENT,
        QUESTION_IN_ROOT,
        QUESTION_IN_FIRST,
        QUESTION_IN_SECOND,
      ]) {
        expect(await findPanelItem(getLabel(question))).toBeInTheDocument();
      }

      await verifyPanelNavigation({
        router,
        item: TABLE,
        groupLabel: "6 questions",
        dependent: QUESTION_IN_DOCUMENT,
        dependentLocation: "Document",
      });
      await verifyPanelNavigation({
        router,
        item: TABLE,
        groupLabel: "1 model",
        dependent: TABLE_BASED_MODEL,
        dependentLocation: "Our analytics",
      });
      await verifyPanelNavigation({
        router,
        item: TABLE,
        groupLabel: "1 metric",
        dependent: TABLE_BASED_METRIC,
      });
      await verifyPanelNavigation({
        router,
        item: TABLE,
        groupLabel: "1 segment",
        dependent: TABLE_BASED_SEGMENT,
      });
      await verifyPanelNavigation({
        router,
        item: TABLE,
        groupLabel: "1 measure",
        dependent: TABLE_BASED_MEASURE,
      });
      await verifyPanelNavigation({
        router,
        item: TABLE,
        groupLabel: "1 data action",
        dependent: TABLE_BASED_ACTION,
        dependentLocation: "Data actions",
      });
    });

    it("should navigate from a table to its transform and to the table the transform generates", async () => {
      const { router } = setup({ entry: TABLE });

      await clickDependentGroup("Scoreboard Actions", "1 transform");
      const panelItem = await findPanelItem("Table-based transform");
      expect(getLastDependentsRequestParams()).toMatchObject({
        id: String(TABLE.id),
        type: "table",
        "dependent-types": ["transform"],
        "dependent-card-types": [],
      });
      await userEvent.click(
        within(panelItem).getByText("Table-based transform"),
      );
      await findEntryButton("Table-based transform");

      await userEvent.click(
        within(getDependencyPanel()).getByRole("button", { name: "Close" }),
      );
      expect(
        screen.queryByTestId("graph-dependency-panel"),
      ).not.toBeInTheDocument();

      await verifyPanelNavigation({
        router,
        item: TABLE_BASED_TRANSFORM,
        groupLabel: "1 table",
        dependent: TRANSFORM_TABLE,
      });
    });

    it.each<{
      name: string;
      item: DependencyNode;
      groups: { groupLabel: string; dependentLabel: string }[];
    }>([
      {
        name: "segment",
        item: TABLE_BASED_SEGMENT,
        groups: [
          {
            groupLabel: "1 question",
            dependentLabel: "Segment-based question",
          },
          { groupLabel: "1 model", dependentLabel: "Segment-based model" },
          { groupLabel: "1 measure", dependentLabel: "Segment-based measure" },
          { groupLabel: "1 metric", dependentLabel: "Segment-based metric" },
          { groupLabel: "1 segment", dependentLabel: "Segment-based segment" },
        ],
      },
      {
        name: "measure",
        item: TABLE_BASED_MEASURE,
        groups: [
          {
            groupLabel: "1 question",
            dependentLabel: "Measure-based question",
          },
          { groupLabel: "1 model", dependentLabel: "Measure-based model" },
          { groupLabel: "1 metric", dependentLabel: "Measure-based metric" },
          {
            groupLabel: "1 transform",
            dependentLabel: "Measure-based transform",
          },
          { groupLabel: "1 measure", dependentLabel: "Measure-based measure" },
        ],
      },
      {
        name: "metric",
        item: TABLE_BASED_METRIC,
        groups: [
          { groupLabel: "1 question", dependentLabel: "Metric-based question" },
          { groupLabel: "1 model", dependentLabel: "Metric-based model" },
          { groupLabel: "1 metric", dependentLabel: "Metric-based metric" },
          {
            groupLabel: "1 transform",
            dependentLabel: "Metric-based transform",
          },
        ],
      },
      {
        name: "snippet",
        item: EMPTY_SNIPPET,
        groups: [
          {
            groupLabel: "1 question",
            dependentLabel: "Snippet-based question",
          },
          { groupLabel: "1 model", dependentLabel: "Snippet-based model" },
          {
            groupLabel: "1 transform",
            dependentLabel: "Snippet-based transform",
          },
          {
            groupLabel: "1 SQL snippet",
            dependentLabel: "Snippet-based snippet",
          },
          {
            groupLabel: "1 data action",
            dependentLabel: "Snippet-based data action",
          },
        ],
      },
    ])(
      "should display the dependents of a $name and navigate to them",
      async ({ item, groups }) => {
        const { router } = setup({ entry: item });

        for (const { groupLabel, dependentLabel } of groups) {
          const dependent = DEPENDENTS.get(item)!.find(
            (node) => getLabel(node) === dependentLabel,
          )!;
          await verifyPanelNavigation({
            router,
            item,
            groupLabel,
            dependent,
          });
        }
        expect(getEntryButton()).toHaveTextContent(getLabel(item));
      },
    );

    it("should display the dependents of a question and a model and navigate to them", async () => {
      const { router } = setup({ entry: TABLE_BASED_QUESTION });

      expect(await findGraphNode("Scoreboard Actions")).toBeInTheDocument();
      expect(await findGraphNode("Table-based question")).toBeInTheDocument();
      await userEvent.click(screen.getByTestId("graph-selection-button"));
      expect(await findOption("Scoreboard Actions")).toBeInTheDocument();
      await userEvent.click(await findOption("Scoreboard Actions"));

      for (const [groupLabel, suffix] of [
        ["1 question", "question"],
        ["1 model", "model"],
        ["1 metric", "metric"],
        ["1 transform", "transform"],
        ["1 SQL snippet", "snippet"],
      ]) {
        const dependent = DEPENDENTS.get(TABLE_BASED_QUESTION)!.find(
          (node) => getLabel(node) === `Question-based ${suffix}`,
        )!;
        await verifyPanelNavigation({
          router,
          item: TABLE_BASED_QUESTION,
          groupLabel,
          dependent,
        });
      }

      await userEvent.click(within(getEntryButton()).getByLabelText("Remove"));
      await userEvent.type(
        await screen.findByPlaceholderText(
          "Pick an item to see its dependencies",
        ),
        "Table-based model",
      );
      await userEvent.click(await findOption("Table-based model"));
      await findEntryButton("Table-based model");

      for (const [groupLabel, suffix] of [
        ["1 question", "question"],
        ["1 model", "model"],
        ["1 metric", "metric"],
        ["1 transform", "transform"],
        ["1 SQL snippet", "snippet"],
      ]) {
        const dependent = DEPENDENTS.get(TABLE_BASED_MODEL)!.find(
          (node) => getLabel(node) === `Model-based ${suffix}`,
        )!;
        await verifyPanelNavigation({
          router,
          item: TABLE_BASED_MODEL,
          groupLabel,
          dependent,
        });
      }
    });

    it("should display the folder and parameters of a data action, and its location in the dependents of a table", async () => {
      const { router } = setup({ entry: FOLDER_ACTION_TABLE });

      await verifyPanelNavigation({
        router,
        item: FOLDER_ACTION_TABLE,
        groupLabel: "1 data action",
        dependent: FOLDER_ACTION,
        dependentLocation: "Data actions folder",
      });

      act(() =>
        router.navigate(`${BASE_URL}?id=${FOLDER_ACTION.id}&type=action`),
      );
      expect(await findGraphNode("Scoreboard Actions")).toBeInTheDocument();
      const actionNode = await findGraphNode("Table-based data action");
      fireEvent.click(within(actionNode).getByText("Table-based data action"));

      const infoPanel = await screen.findByTestId("graph-info-panel");
      expect(
        within(infoPanel).getByText("Data actions folder"),
      ).toBeInTheDocument();
      expect(within(infoPanel).getByText("Parameters")).toBeInTheDocument();
      expect(within(infoPanel).getByText("Team ID")).toBeInTheDocument();
    });
  });
});
