import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  act,
  createMockDOMRect,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type {
  DatabaseId,
  ErdEdge,
  ErdNode,
  ErdResponse,
  SchemaName,
  TableId,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockErdEdge,
  createMockErdField,
  createMockErdNode,
  createMockTable,
} from "metabase-types/api/mocks";

import { SchemaViewerPage } from "./SchemaViewerPage";

// jsdom has no layout. React Flow measures nodes through `offsetWidth`,
// `ResizeObserver` and the viewport's computed transform, and the camera
// reads the canvas size from `getBoundingClientRect`. These mocks give the
// canvas a fixed size and each node the size from its inline style, so nodes,
// edges and camera moves render the way they do in a browser.
const CANVAS_WIDTH_PX = 600;
const CANVAS_HEIGHT_PX = 400;
// Mirrors the camera constants in `utils/zoom.ts` and `constants.ts`.
const MIN_ZOOM = 0.3;
const MIN_ZOOM_FOR_TARGET = 0.5;
const TOP_MARGIN_PX = 50;

class TestResizeObserver implements ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}

  observe(target: Element) {
    setTimeout(() => {
      act(() => {
        const entry: ResizeObserverEntry = {
          target,
          contentRect: target.getBoundingClientRect(),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        };
        this.callback([entry], this);
      });
    }, 0);
  }

  unobserve() {}

  disconnect() {}
}

class TestDOMMatrixReadOnly {
  m22: number;

  constructor(transform?: string) {
    this.m22 = parseTransform(transform ?? "").zoom;
  }
}

function isCanvasElement(element: Element) {
  return (
    element.classList.contains("react-flow") ||
    element.classList.contains("react-flow__renderer")
  );
}

function getElementSizePx(element: HTMLElement, dimension: "width" | "height") {
  if (isCanvasElement(element)) {
    return dimension === "width" ? CANVAS_WIDTH_PX : CANVAS_HEIGHT_PX;
  }
  if (element.classList.contains("react-flow__handle")) {
    return 6;
  }
  const size = parseFloat(element.style[dimension]);
  return Number.isNaN(size) ? 0 : size;
}

const originalResizeObserver = window.ResizeObserver;

function mockCanvasLayout() {
  window.ResizeObserver = TestResizeObserver;
  Object.defineProperty(window, "DOMMatrixReadOnly", {
    configurable: true,
    value: TestDOMMatrixReadOnly,
  });
  jest
    .spyOn(HTMLElement.prototype, "offsetWidth", "get")
    .mockImplementation(function (this: HTMLElement) {
      return getElementSizePx(this, "width");
    });
  jest
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockImplementation(function (this: HTMLElement) {
      return getElementSizePx(this, "height");
    });
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      if (isCanvasElement(this)) {
        return createMockDOMRect({
          width: CANVAS_WIDTH_PX,
          height: CANVAS_HEIGHT_PX,
          right: CANVAS_WIDTH_PX,
          bottom: CANVAS_HEIGHT_PX,
        });
      }
      return createMockDOMRect();
    });
}

function parseTransform(transform: string) {
  const translate = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
  const scale = /scale\(([\d.]+)\)/.exec(transform);
  return {
    x: translate ? parseFloat(translate[1]) : 0,
    y: translate ? parseFloat(translate[2]) : 0,
    zoom: scale ? parseFloat(scale[1]) : 1,
  };
}

// The camera position is the inline transform of React Flow's viewport, which
// has no role, label or test id.
function getViewport() {
  // eslint-disable-next-line testing-library/no-node-access -- see above
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  return parseTransform(viewport?.style.transform ?? "");
}

function getTableNode(tableId: TableId) {
  return screen.getByTestId(`rf__node-table-${tableId}`);
}

function queryTableNode(tableId: TableId) {
  return screen.queryByTestId(`rf__node-table-${tableId}`);
}

// The table's rectangle on screen, in pixels from the canvas's top-left.
function getTableScreenRect(tableId: TableId) {
  const node = getTableNode(tableId);
  const position = parseTransform(node.style.transform);
  const viewport = getViewport();
  const left = position.x * viewport.zoom + viewport.x;
  const top = position.y * viewport.zoom + viewport.y;
  return {
    left,
    top,
    right: left + parseFloat(node.style.width) * viewport.zoom,
    bottom: top + parseFloat(node.style.height) * viewport.zoom,
  };
}

// Every camera move onto a table centres it horizontally and puts its top
// edge TOP_MARGIN_PX below the top of the canvas, at a legible zoom.
async function expectTableFocused(tableId: TableId) {
  await waitFor(
    () => {
      const rect = getTableScreenRect(tableId);
      expect(rect.top).toBeCloseTo(TOP_MARGIN_PX, 0);
      expect(rect.left).toBeLessThan(CANVAS_WIDTH_PX / 2);
      expect(rect.right).toBeGreaterThan(CANVAS_WIDTH_PX / 2);
      expect(getViewport().zoom).toBeGreaterThanOrEqual(MIN_ZOOM_FOR_TARGET);
    },
    { timeout: 3000 },
  );
}

function isTableFullyOnScreen(tableId: TableId) {
  const rect = getTableScreenRect(tableId);
  return (
    rect.left >= 0 &&
    rect.right <= CANVAS_WIDTH_PX &&
    rect.top >= 0 &&
    rect.bottom <= CANVAS_HEIGHT_PX
  );
}

function getEdges() {
  return screen.queryAllByTestId(/^rf__edge-/);
}

function getEdgePath(edgeId: string) {
  return within(screen.getByTestId(`rf__edge-${edgeId}`)).getByTestId(
    "schema-viewer-edge-path",
  );
}

function getSelectedEdgePaths() {
  return screen
    .queryAllByTestId("schema-viewer-edge-path")
    .filter((path) => path.getAttribute("data-selected") === "true");
}

function getInfoPanel() {
  return screen.getByTestId("graph-info-panel");
}

// userEvent dispatches mouse events without a `view`, which React Flow's
// node drag handler dereferences on `mousedown`. A real browser always sets it.
function clickOnCanvas(element: Element, { detail = 1 } = {}) {
  const init = { view: window, bubbles: true, detail };
  fireEvent.mouseDown(element, init);
  fireEvent.mouseUp(element, init);
  fireEvent.click(element, init);
}

function doubleClickOnCanvas(element: Element) {
  clickOnCanvas(element, { detail: 1 });
  clickOnCanvas(element, { detail: 2 });
  fireEvent.doubleClick(element, { view: window, bubbles: true, detail: 2 });
}

function clickTableHeader(tableId: TableId, name: string) {
  clickOnCanvas(within(getTableNode(tableId)).getByText(name));
}

// --- Sample Database ---

const SAMPLE_DB_ID = 1;
const PUBLIC = "PUBLIC";
const ORDERS_ID = 10;
const PEOPLE_ID = 20;
const PRODUCTS_ID = 30;
const REVIEWS_ID = 40;

const SAMPLE_NODES: ErdNode[] = [
  createMockErdNode({
    table_id: ORDERS_ID,
    name: "ORDERS",
    schema: PUBLIC,
    db_id: SAMPLE_DB_ID,
    fields: [
      createMockErdField({ id: 100, name: "ID", semantic_type: "type/PK" }),
      createMockErdField({
        id: 101,
        name: "USER_ID",
        semantic_type: "type/FK",
        fk_target_table_id: PEOPLE_ID,
        fk_target_field_id: 200,
      }),
      createMockErdField({
        id: 102,
        name: "PRODUCT_ID",
        semantic_type: "type/FK",
        fk_target_table_id: PRODUCTS_ID,
        fk_target_field_id: 300,
      }),
      createMockErdField({ id: 103, name: "TOTAL" }),
    ],
  }),
  createMockErdNode({
    table_id: PEOPLE_ID,
    name: "PEOPLE",
    schema: PUBLIC,
    db_id: SAMPLE_DB_ID,
    fields: [
      createMockErdField({ id: 200, name: "ID", semantic_type: "type/PK" }),
      createMockErdField({ id: 201, name: "EMAIL" }),
    ],
  }),
  createMockErdNode({
    table_id: PRODUCTS_ID,
    name: "PRODUCTS",
    schema: PUBLIC,
    db_id: SAMPLE_DB_ID,
    fields: [
      createMockErdField({ id: 300, name: "ID", semantic_type: "type/PK" }),
      createMockErdField({ id: 301, name: "TITLE" }),
    ],
  }),
  createMockErdNode({
    table_id: REVIEWS_ID,
    name: "REVIEWS",
    schema: PUBLIC,
    db_id: SAMPLE_DB_ID,
    fields: [
      createMockErdField({ id: 400, name: "ID", semantic_type: "type/PK" }),
      createMockErdField({
        id: 401,
        name: "PRODUCT_ID",
        semantic_type: "type/FK",
        fk_target_table_id: PRODUCTS_ID,
        fk_target_field_id: 300,
      }),
    ],
  }),
];

const SAMPLE_EDGES: ErdEdge[] = [
  createMockErdEdge({
    source_table_id: ORDERS_ID,
    source_field_id: 101,
    target_table_id: PEOPLE_ID,
    target_field_id: 200,
  }),
  createMockErdEdge({
    source_table_id: ORDERS_ID,
    source_field_id: 102,
    target_table_id: PRODUCTS_ID,
    target_field_id: 300,
  }),
  createMockErdEdge({
    source_table_id: REVIEWS_ID,
    source_field_id: 401,
    target_table_id: PRODUCTS_ID,
    target_field_id: 300,
  }),
];

// --- Multi-schema Postgres: one-to-one, self-reference, cross-schema FK ---

const PG_DB_ID = 2;
const SV_TEST = "sv_test";
const SV_EXTRA = "sv_extra";
const USERS_ID = 51;
const PROFILES_ID = 52;
const CATEGORIES_ID = 53;
const PG_PRODUCTS_ID = 54;
const LOOKUP_ID = 55;
const OTHER_ID = 56;

const PG_SCHEMA_NODES: ErdNode[] = [
  createMockErdNode({
    table_id: USERS_ID,
    name: "users",
    schema: SV_TEST,
    db_id: PG_DB_ID,
    fields: [
      createMockErdField({ id: 510, name: "id", semantic_type: "type/PK" }),
      createMockErdField({ id: 511, name: "name" }),
    ],
  }),
  createMockErdNode({
    table_id: PROFILES_ID,
    name: "profiles",
    schema: SV_TEST,
    db_id: PG_DB_ID,
    fields: [
      createMockErdField({
        id: 520,
        name: "user_id",
        semantic_type: "type/FK",
        fk_target_table_id: USERS_ID,
        fk_target_field_id: 510,
      }),
      createMockErdField({ id: 521, name: "bio" }),
    ],
  }),
  createMockErdNode({
    table_id: CATEGORIES_ID,
    name: "categories",
    schema: SV_TEST,
    db_id: PG_DB_ID,
    fields: [
      createMockErdField({ id: 530, name: "id", semantic_type: "type/PK" }),
      createMockErdField({
        id: 531,
        name: "parent_id",
        semantic_type: "type/FK",
        fk_target_table_id: CATEGORIES_ID,
        fk_target_field_id: 530,
      }),
    ],
  }),
  createMockErdNode({
    table_id: PG_PRODUCTS_ID,
    name: "products",
    schema: SV_TEST,
    db_id: PG_DB_ID,
    fields: [
      createMockErdField({ id: 540, name: "id", semantic_type: "type/PK" }),
      createMockErdField({
        id: 541,
        name: "lookup_id",
        semantic_type: "type/FK",
        fk_target_table_id: LOOKUP_ID,
        fk_target_field_id: 550,
      }),
    ],
  }),
];

const PG_EXTRA_NODES: ErdNode[] = [
  createMockErdNode({
    table_id: LOOKUP_ID,
    name: "lookup",
    schema: SV_EXTRA,
    db_id: PG_DB_ID,
    fields: [
      createMockErdField({ id: 550, name: "id", semantic_type: "type/PK" }),
    ],
  }),
  createMockErdNode({
    table_id: OTHER_ID,
    name: "other",
    schema: SV_EXTRA,
    db_id: PG_DB_ID,
    fields: [
      createMockErdField({ id: 560, name: "id", semantic_type: "type/PK" }),
    ],
  }),
];

const PG_EDGES: ErdEdge[] = [
  createMockErdEdge({
    source_table_id: PROFILES_ID,
    source_field_id: 520,
    target_table_id: USERS_ID,
    target_field_id: 510,
    relationship: "one-to-one",
  }),
  createMockErdEdge({
    source_table_id: CATEGORIES_ID,
    source_field_id: 531,
    target_table_id: CATEGORIES_ID,
    target_field_id: 530,
  }),
  createMockErdEdge({
    source_table_id: PG_PRODUCTS_ID,
    source_field_id: 541,
    target_table_id: LOOKUP_ID,
    target_field_id: 550,
  }),
];

const SAMPLE_DB = createMockDatabase({
  id: SAMPLE_DB_ID,
  name: "Sample Database",
  tables: SAMPLE_NODES.map((node) =>
    createMockTable({
      id: node.table_id,
      db_id: SAMPLE_DB_ID,
      name: node.name,
      display_name: node.name,
      schema: PUBLIC,
    }),
  ),
});

const PG_DB = createMockDatabase({
  id: PG_DB_ID,
  name: "Writable Postgres12",
  engine: "postgres",
  tables: [...PG_SCHEMA_NODES, ...PG_EXTRA_NODES].map((node) =>
    createMockTable({
      id: node.table_id,
      db_id: PG_DB_ID,
      name: node.name,
      display_name: node.name,
      schema: node.schema ?? "",
    }),
  ),
});

type ErdRequest = {
  databaseId: string | null;
  schema: string | null;
  tableIds: string[];
};

function getErdRequests(): ErdRequest[] {
  return fetchMock.callHistory.calls("erd").map((call) => {
    const params = new URL(call.url).searchParams;
    return {
      databaseId: params.get("database-id"),
      schema: params.get("schema"),
      tableIds: params.getAll("table-ids"),
    };
  });
}

// The ERD response for a request, the way the backend builds it: every table
// of the requested schema plus the requested extra tables, and an edge only
// between two returned tables.
function getErdResponse({
  databaseId,
  schema,
  tableIds,
}: ErdRequest): ErdResponse {
  const extraIds = new Set(tableIds.map(Number));
  let nodes: ErdNode[] = [];
  let edges: ErdEdge[] = [];
  if (databaseId === String(SAMPLE_DB_ID) && schema === PUBLIC) {
    nodes = SAMPLE_NODES;
    edges = SAMPLE_EDGES;
  } else if (databaseId === String(PG_DB_ID) && schema === SV_TEST) {
    nodes = [
      ...PG_SCHEMA_NODES,
      ...PG_EXTRA_NODES.filter((node) => extraIds.has(node.table_id)),
    ];
    edges = PG_EDGES;
  }
  const returnedIds = new Set(nodes.map((node) => node.table_id));
  return {
    nodes,
    edges: edges.filter(
      (edge) =>
        returnedIds.has(edge.source_table_id) &&
        returnedIds.has(edge.target_table_id),
    ),
  };
}

function getKeyValueKey(url: string) {
  return decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
}

type SavedTableIds = { table_ids: TableId[] };
type LastDatabase = { databaseId: DatabaseId; schema: SchemaName | undefined };

type SetupOpts = {
  initialRoute?: string;
  lastDatabase?: LastDatabase;
  savedTableIds?: Record<string, SavedTableIds>;
  erdDelayMs?: number;
  erdError?: { status: number; body: string };
};

function setup({
  initialRoute = `/?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC}`,
  lastDatabase,
  savedTableIds = {},
  erdDelayMs,
  erdError,
}: SetupOpts = {}) {
  mockCanvasLayout();
  setupDatabasesEndpoints([SAMPLE_DB, PG_DB]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });

  // Stored like the backend stores user key-values: a PUT changes what the
  // next GET returns, and a key that was never written returns 204.
  const store = new Map<string, unknown>(
    Object.entries(savedTableIds).map(([contextKey, value]) => [
      contextKey,
      value,
    ]),
  );
  if (lastDatabase != null) {
    store.set("last_database", lastDatabase);
  }
  const keyValueRoute =
    "express:/api/user-key-value/namespace/schema_viewer/key/:key";
  fetchMock.get(keyValueRoute, (call) => {
    const key = getKeyValueKey(call.url);
    return store.has(key) ? { body: store.get(key) } : { status: 204 };
  });
  fetchMock.put(
    keyValueRoute,
    (call) => {
      const key = getKeyValueKey(call.url);
      const body: unknown = JSON.parse(String(call.options.body));
      const value =
        typeof body === "object" && body != null && "value" in body
          ? body.value
          : undefined;
      store.set(key, value);
      return { status: 200, body: value };
    },
    { name: "put-key-value" },
  );

  fetchMock.get(
    "path:/api/ee/erd",
    (call) => {
      if (erdError != null) {
        return erdError;
      }
      const params = new URL(call.url).searchParams;
      return getErdResponse({
        databaseId: params.get("database-id"),
        schema: params.get("schema"),
        tableIds: params.getAll("table-ids"),
      });
    },
    { name: "erd", delay: erdDelayMs },
  );

  const { router } = renderWithProviders(
    <Route path="*" element={<SchemaViewerPage />} />,
    { withRouter: true, initialRoute },
  );

  return {
    getSearchParams: () => new URLSearchParams(router?.location.search),
    getStoredValue: (key: string) => store.get(key),
  };
}

function getKeyValuePuts() {
  return fetchMock.callHistory.calls("put-key-value").map((call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    return { key: getKeyValueKey(call.url), body };
  });
}

async function waitForSampleCanvas() {
  await waitFor(() => {
    expect(getEdges()).toHaveLength(SAMPLE_EDGES.length);
  });
  await waitFor(() => {
    for (const node of SAMPLE_NODES) {
      expect(getTableNode(node.table_id)).toHaveStyle({ opacity: "1" });
    }
  });
}

describe("SchemaViewerPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.ResizeObserver = originalResizeObserver;
  });

  describe("canvas", () => {
    it("fetches the ERD for the URL's database and schema and renders every table and edge", async () => {
      setup();

      await waitForSampleCanvas();
      expect(getErdRequests()).toEqual([
        { databaseId: String(SAMPLE_DB_ID), schema: PUBLIC, tableIds: [] },
      ]);
      expect(screen.getByTestId(`rf__edge-edge-101-200`)).toBeInTheDocument();
      expect(screen.getByTestId(`rf__edge-edge-102-300`)).toBeInTheDocument();
      expect(screen.getByTestId(`rf__edge-edge-401-300`)).toBeInTheDocument();
      expect(screen.getByTestId("schema-picker-button")).toHaveTextContent(
        PUBLIC,
      );
    });

    it("opens the info panel for the clicked table with its breadcrumb, fields and FK targets", async () => {
      setup();
      await waitForSampleCanvas();

      clickTableHeader(ORDERS_ID, "ORDERS");

      const panel = await screen.findByTestId("graph-info-panel");
      expect(
        within(panel).getByRole("heading", { name: "ORDERS" }),
      ).toBeInTheDocument();
      expect(
        within(panel).getByRole("link", { name: "Sample Database" }),
      ).toBeInTheDocument();
      expect(
        within(panel).getByRole("link", { name: PUBLIC }),
      ).toBeInTheDocument();
      expect(within(panel).getByText("USER_ID")).toBeInTheDocument();
      expect(within(panel).getByText("TOTAL")).toBeInTheDocument();
      expect(
        within(panel).getByRole("button", { name: /PEOPLE/ }),
      ).toBeInTheDocument();
      expect(
        within(panel).getByRole("button", { name: /PRODUCTS/ }),
      ).toBeInTheDocument();
      // The panel is read-only: it has no "Find and replace" action.
      expect(
        within(panel).queryByRole("button", { name: /Replace/i }),
      ).not.toBeInTheDocument();
    });

    it("moves the camera from the info panel's title and FK links without changing the selection", async () => {
      setup();
      await waitForSampleCanvas();

      clickTableHeader(REVIEWS_ID, "REVIEWS");
      const panel = await screen.findByTestId("graph-info-panel");

      await userEvent.click(
        within(panel).getByRole("heading", { name: "REVIEWS" }),
      );
      await expectTableFocused(REVIEWS_ID);

      await userEvent.click(
        within(panel).getByRole("button", { name: /PRODUCTS/ }),
      );
      await expectTableFocused(PRODUCTS_ID);
      expect(
        within(getInfoPanel()).getByRole("heading", { name: "REVIEWS" }),
      ).toBeInTheDocument();
    });

    it("fits every table on screen with Auto-layout and zooms onto the selected table with Focus node", async () => {
      setup();
      await waitForSampleCanvas();

      clickTableHeader(PEOPLE_ID, "PEOPLE");
      await userEvent.click(
        within(getInfoPanel()).getByRole("heading", { name: "PEOPLE" }),
      );
      await expectTableFocused(PEOPLE_ID);
      expect(
        SAMPLE_NODES.filter((node) => !isTableFullyOnScreen(node.table_id)),
      ).not.toHaveLength(0);

      await userEvent.click(
        screen.getByRole("button", { name: /Auto-layout/ }),
      );
      await waitFor(
        () => {
          for (const node of SAMPLE_NODES) {
            expect(isTableFullyOnScreen(node.table_id)).toBe(true);
          }
        },
        { timeout: 3000 },
      );
      expect(getViewport().zoom).toBeGreaterThanOrEqual(MIN_ZOOM);

      await userEvent.click(screen.getByRole("button", { name: "Focus node" }));
      await expectTableFocused(PEOPLE_ID);
    });

    it("zooms onto a double-clicked table and moves the selection to it", async () => {
      setup();
      await waitForSampleCanvas();

      clickTableHeader(ORDERS_ID, "ORDERS");
      expect(
        await screen.findByRole("button", { name: "Focus node" }),
      ).toBeInTheDocument();

      doubleClickOnCanvas(
        within(getTableNode(REVIEWS_ID)).getByText("REVIEWS"),
      );
      await expectTableFocused(REVIEWS_ID);
      expect(
        screen.getByRole("button", { name: "Focus node" }),
      ).toBeInTheDocument();
      expect(
        within(getInfoPanel()).getByRole("heading", { name: "REVIEWS" }),
      ).toBeInTheDocument();
      expect(
        within(getInfoPanel()).queryByRole("heading", { name: "ORDERS" }),
      ).not.toBeInTheDocument();
    });

    it("clears the selection when the info panel closes", async () => {
      setup();
      await waitForSampleCanvas();

      clickTableHeader(PRODUCTS_ID, "PRODUCTS");
      expect(
        await screen.findByRole("button", { name: "Focus node" }),
      ).toBeInTheDocument();

      await userEvent.click(
        within(getInfoPanel()).getByRole("button", { name: "Close" }),
      );
      expect(screen.queryByTestId("graph-info-panel")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Focus node" }),
      ).not.toBeInTheDocument();
      // The canvas is still there, so the selection, not the canvas, went away.
      expect(
        screen.getByRole("button", { name: /Auto-layout/ }),
      ).toBeInTheDocument();
    });

    it("selects the FK's edge when its target is on the canvas, and re-clicking the edge alternates the camera between its ends", async () => {
      setup();
      await waitForSampleCanvas();
      expect(getSelectedEdgePaths()).toHaveLength(0);

      clickOnCanvas(within(getTableNode(ORDERS_ID)).getByText("USER_ID"));
      await expectTableFocused(PEOPLE_ID);
      await waitFor(() => {
        expect(getSelectedEdgePaths()).toEqual([getEdgePath("edge-101-200")]);
      });

      clickOnCanvas(screen.getByTestId("rf__edge-edge-101-200"));
      await expectTableFocused(ORDERS_ID);
      clickOnCanvas(screen.getByTestId("rf__edge-edge-101-200"));
      await expectTableFocused(PEOPLE_ID);
    });

    it("moves the camera to the table picked in the search", async () => {
      setup();
      await waitForSampleCanvas();

      const input = screen.getByTestId("schema-viewer-node-search-input");
      await userEvent.click(input);
      expect(input).toHaveFocus();
      await userEvent.type(input, "rev");
      await userEvent.click(
        await screen.findByRole("option", { name: /REVIEWS/ }),
      );
      await expectTableFocused(REVIEWS_ID);
    });

    it("zooms onto the table pinned by the URL's table-ids", async () => {
      setup({
        initialRoute: `/?database-id=${SAMPLE_DB_ID}&schema=${PUBLIC}&table-ids=${REVIEWS_ID}`,
      });
      await waitForSampleCanvas();

      await expectTableFocused(REVIEWS_ID);
      expect(getErdRequests()).toEqual([
        {
          databaseId: String(SAMPLE_DB_ID),
          schema: PUBLIC,
          tableIds: [String(REVIEWS_ID)],
        },
      ]);
    });
  });

  describe("loading and errors", () => {
    it("shows the loader until the ERD response arrives", async () => {
      setup({ erdDelayMs: 300 });

      expect(
        await screen.findByTestId("schema-viewer-loader"),
      ).toBeInTheDocument();
      expect(queryTableNode(ORDERS_ID)).not.toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.queryByTestId("schema-viewer-loader"),
        ).not.toBeInTheDocument();
      });
      expect(getTableNode(ORDERS_ID)).toBeInTheDocument();
    });

    it("shows the error message when the ERD request fails", async () => {
      setup({ erdError: { status: 500, body: "boom" } });

      expect(
        await screen.findByTestId("schema-viewer-error"),
      ).toHaveTextContent("boom");
      expect(queryTableNode(ORDERS_ID)).not.toBeInTheDocument();
    });
  });

  describe("picker and saved context", () => {
    it("opens the picker on the bare URL and loads the picked schema", async () => {
      const { getSearchParams } = setup({ initialRoute: "/" });

      expect(
        within(screen.getByTestId("schema-picker-button")).getByText(
          "Pick a schema to view",
        ),
      ).toBeInTheDocument();

      await userEvent.click(await screen.findByText("Writable Postgres12"));
      expect(await screen.findByText(SV_EXTRA)).toBeInTheDocument();
      await userEvent.click(screen.getByText(SV_TEST));

      await waitFor(() => {
        expect(getTableNode(PG_PRODUCTS_ID)).toBeInTheDocument();
      });
      expect(getSearchParams().get("database-id")).toBe(String(PG_DB_ID));
      expect(getSearchParams().get("schema")).toBe(SV_TEST);
      expect(getErdRequests()).toEqual([
        { databaseId: String(PG_DB_ID), schema: SV_TEST, tableIds: [] },
      ]);
      await waitFor(() => {
        expect(getKeyValuePuts()).toContainEqual({
          key: "last_database",
          body: { value: { databaseId: PG_DB_ID, schema: SV_TEST } },
        });
      });
    });

    it("redirects the bare URL to the last opened database and schema, keeping the picker open at the database list", async () => {
      const { getSearchParams } = setup({
        initialRoute: "/",
        lastDatabase: { databaseId: SAMPLE_DB_ID, schema: PUBLIC },
      });

      await waitForSampleCanvas();
      expect(getSearchParams().get("database-id")).toBe(String(SAMPLE_DB_ID));
      expect(getSearchParams().get("schema")).toBe(PUBLIC);
      expect(getErdRequests()).toEqual([
        { databaseId: String(SAMPLE_DB_ID), schema: PUBLIC, tableIds: [] },
      ]);
      expect(screen.getByTestId("schema-picker-button")).toHaveTextContent(
        PUBLIC,
      );

      const picker = screen.getByTestId("mini-picker");
      expect(within(picker).getByText("Sample Database")).toBeInTheDocument();
      expect(
        within(picker).queryByTestId("mini-picker-header"),
      ).not.toBeInTheDocument();

      await userEvent.click(document.body);
      await waitFor(() => {
        expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("schema-picker-button"));
      const reopened = await screen.findByTestId("mini-picker");
      expect(
        await within(reopened).findByText("Writable Postgres12"),
      ).toBeInTheDocument();
      expect(
        within(reopened).queryByTestId("mini-picker-header"),
      ).not.toBeInTheDocument();
    });
  });

  describe("multi-schema database", () => {
    const PG_ROUTE = `/?database-id=${PG_DB_ID}&schema=${SV_TEST}`;

    it("renders one-to-one and self-referencing edges, and no node or edge for an off-schema FK target", async () => {
      setup({ initialRoute: PG_ROUTE });

      await waitFor(() => {
        expect(getEdges()).toHaveLength(2);
      });
      for (const node of PG_SCHEMA_NODES) {
        expect(getTableNode(node.table_id)).toBeInTheDocument();
      }
      expect(screen.getByTestId("rf__edge-edge-520-510")).toBeInTheDocument();
      expect(screen.getByTestId("rf__edge-edge-531-530")).toBeInTheDocument();
      expect(queryTableNode(LOOKUP_ID)).not.toBeInTheDocument();

      clickOnCanvas(within(getTableNode(PROFILES_ID)).getByText("user_id"));
      await waitFor(() => {
        expect(getSelectedEdgePaths()).toEqual([getEdgePath("edge-520-510")]);
      });
      expect(getEdgePath("edge-520-510")).toHaveStyle({ strokeWidth: "2" });
      expect(getEdgePath("edge-531-530")).toHaveStyle({ strokeWidth: "1" });
    });

    it("adds an off-canvas FK target to the canvas, focuses it and saves it for the context", async () => {
      const { getStoredValue } = setup({ initialRoute: PG_ROUTE });
      await waitFor(() => {
        expect(getEdges()).toHaveLength(2);
      });

      clickOnCanvas(
        within(getTableNode(PG_PRODUCTS_ID)).getByText("lookup_id"),
      );

      await waitFor(() => {
        expect(getTableNode(LOOKUP_ID)).toBeInTheDocument();
      });
      await expectTableFocused(LOOKUP_ID);
      expect(getEdges()).toHaveLength(3);
      expect(queryTableNode(OTHER_ID)).not.toBeInTheDocument();
      expect(getErdRequests().at(-1)).toEqual({
        databaseId: String(PG_DB_ID),
        schema: SV_TEST,
        tableIds: [String(LOOKUP_ID)],
      });
      await waitFor(() => {
        expect(getStoredValue(`${PG_DB_ID}__${SV_TEST}`)).toEqual({
          table_ids: [LOOKUP_ID],
        });
      });
    });

    it("restores the saved extra tables for the context", async () => {
      setup({
        initialRoute: PG_ROUTE,
        savedTableIds: {
          [`${PG_DB_ID}__${SV_TEST}`]: { table_ids: [LOOKUP_ID] },
        },
      });

      await waitFor(() => {
        expect(getEdges()).toHaveLength(3);
      });
      expect(getTableNode(LOOKUP_ID)).toBeInTheDocument();
      expect(getErdRequests()).toEqual([
        {
          databaseId: String(PG_DB_ID),
          schema: SV_TEST,
          tableIds: [String(LOOKUP_ID)],
        },
      ]);
    });

    it("prefers the URL's table-ids over the saved extra tables", async () => {
      setup({
        initialRoute: `${PG_ROUTE}&table-ids=${OTHER_ID}`,
        savedTableIds: {
          [`${PG_DB_ID}__${SV_TEST}`]: { table_ids: [LOOKUP_ID] },
        },
      });

      await waitFor(() => {
        expect(getTableNode(OTHER_ID)).toBeInTheDocument();
      });
      expect(queryTableNode(LOOKUP_ID)).not.toBeInTheDocument();
      expect(getErdRequests()).toEqual([
        {
          databaseId: String(PG_DB_ID),
          schema: SV_TEST,
          tableIds: [String(OTHER_ID)],
        },
      ]);
    });
  });
});
