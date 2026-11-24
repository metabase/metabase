import fetchMock from "fetch-mock";
import type { ReactElement } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupTablesBulkEndpoints,
  setupUserAcknowledgementEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Collection,
  DependencyGraph,
  Measure,
  Revision,
  Table,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDependencyGraph,
  createMockMeasure,
  createMockMeasureDependencyNode,
  createMockMeasureDependencyNodeData,
  createMockTokenFeatures,
  createMockUser,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

export const SAMPLE_DB_SCHEMA_ID = `${SAMPLE_DB_ID}:PUBLIC`;
export const DATA_MODEL_ORDERS_URL = `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`;
export const DATA_MODEL_PRODUCTS_URL = `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PRODUCTS_ID}`;
export const PUBLISHED_ORDERS_URL = `/data-studio/library/tables/${ORDERS_ID}`;

const LIBRARY_COLLECTION_ID = 10;

const LIBRARY_COLLECTION = createMockCollection({
  id: LIBRARY_COLLECTION_ID,
  name: "Data",
  effective_ancestors: [],
});

export const SAMPLE_DB = createSampleDatabase();

export function createSumOfTotalDefinition() {
  return Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [
          {
            type: "operator",
            operator: "sum",
            args: [{ type: "column", fieldId: ORDERS.TOTAL }],
          },
        ],
      },
    ],
  });
}

export function createOrdersMeasure(opts: Partial<Measure>): Measure {
  return createMockMeasure({
    table_id: ORDERS_ID,
    description: null,
    definition: createSumOfTotalDefinition(),
    definition_description: "Sum of Total",
    ...opts,
  });
}

type MeasureServer = {
  /** Bodies of every `POST /api/measure`, in order. */
  creates: RequestBody[];
  /** Bodies of every `PUT /api/measure/:id`, keyed by the id in the URL. */
  updates: { id: number; body: RequestBody }[];
};

type RequestBody = Record<string, unknown>;

function parseBody(body: unknown): RequestBody {
  const parsed: unknown = JSON.parse(String(body));
  return typeof parsed === "object" && parsed != null && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : {};
}

function getIdFromPath(url: string, entity: string): number {
  const segments = new URL(url).pathname.split("/");
  return Number(segments[segments.indexOf(entity) + 1]);
}

function getFirstStage(body: RequestBody): RequestBody {
  const definition = body.definition;
  const stages =
    typeof definition === "object" &&
    definition != null &&
    "stages" in definition
      ? definition.stages
      : undefined;
  const stage: unknown = Array.isArray(stages) ? stages[0] : undefined;
  return typeof stage === "object" && stage != null
    ? Object.fromEntries(Object.entries(stage))
    : {};
}

/** The aggregations of the MBQL 5 definition in a measure request body. */
export function getRequestAggregations(body: RequestBody): unknown {
  return getFirstStage(body).aggregation;
}

function getSourceTableId(body: RequestBody): number {
  const sourceTable = getFirstStage(body)["source-table"];
  return typeof sourceTable === "number" ? sourceTable : -1;
}

/** Applies the fields that `PUT /api/measure/:id` stores. */
function applyMeasureUpdate(measure: Measure, body: RequestBody): Measure {
  const next = { ...measure };
  if (typeof body.name === "string") {
    next.name = body.name;
  }
  if ("description" in body) {
    next.description =
      typeof body.description === "string" ? body.description : null;
  }
  if (typeof body.archived === "boolean") {
    next.archived = body.archived;
  }
  if (typeof body.definition === "object" && body.definition != null) {
    // The page sends the definition it read from a measure or built with Lib,
    // so it has the shape of a stored definition.
    next.definition = body.definition as Measure["definition"];
  }
  return next;
}

type ServerOpts = {
  measures?: Measure[];
  revisions?: Record<number, Revision[]>;
  isPublished?: boolean;
};

function getTables(measures: Measure[], isPublished: boolean): Table[] {
  const publishing: Partial<Table> = isPublished
    ? { is_published: true, collection_id: LIBRARY_COLLECTION_ID }
    : { is_published: false, collection_id: null };
  return [
    createOrdersTable({
      ...publishing,
      measures: measures.filter(
        (measure) => measure.table_id === ORDERS_ID && !measure.archived,
      ),
    }),
    createPeopleTable(),
    createProductsTable({ measures: [] }),
    createReviewsTable(),
  ];
}

/**
 * Answers the measure, table and revision requests from one list of measures
 * that only the `POST` and `PUT` handlers change, the way the backend stores
 * them.
 */
function setupMeasureServer({
  measures: initialMeasures = [],
  revisions = {},
  isPublished = false,
}: ServerOpts): MeasureServer {
  let measures = [...initialMeasures];
  const server: MeasureServer = { creates: [], updates: [] };

  fetchMock.get("express:/api/measure/:id", (call) => {
    const id = getIdFromPath(call.url, "measure");
    const measure = measures.find((measure) => measure.id === id);
    return measure ?? { status: 404, body: "Not found." };
  });

  fetchMock.put("express:/api/measure/:id", (call) => {
    const id = getIdFromPath(call.url, "measure");
    const body = parseBody(call.options.body);
    server.updates.push({ id, body });
    const measure = measures.find((measure) => measure.id === id);
    if (measure == null) {
      return { status: 404, body: "Not found." };
    }
    const updated = applyMeasureUpdate(measure, body);
    measures = measures.map((m) => (m.id === id ? updated : m));
    return updated;
  });

  fetchMock.post("path:/api/measure", (call) => {
    const body = parseBody(call.options.body);
    server.creates.push(body);
    const created = applyMeasureUpdate(
      createMockMeasure({
        id: Math.max(0, ...measures.map((measure) => measure.id)) + 100,
        table_id: getSourceTableId(body),
        description: null,
      }),
      body,
    );
    measures = [...measures, created];
    return created;
  });

  fetchMock.get("express:/api/table/:id/query_metadata", (call) => {
    const id = getIdFromPath(call.url, "table");
    const table = getTables(measures, isPublished).find(
      (table) => table.id === id,
    );
    return table ?? { status: 404, body: "Not found." };
  });

  fetchMock.get("path:/api/revision", (call) => {
    const params = new URL(call.url).searchParams;
    const id = Number(params.get("id"));
    return params.get("entity") === "measure" ? (revisions[id] ?? []) : [];
  });

  fetchMock.get("path:/api/ee/dependencies/graph", (call) => {
    const params = new URL(call.url).searchParams;
    const id = Number(params.get("id"));
    const measure = measures.find((measure) => measure.id === id);
    if (params.get("type") !== "measure" || measure == null) {
      return { status: 404 };
    }
    const graph: DependencyGraph = createMockDependencyGraph({
      nodes: [
        createMockMeasureDependencyNode({
          id: measure.id,
          data: createMockMeasureDependencyNodeData({
            name: measure.name,
            table_id: ORDERS_ID,
          }),
        }),
      ],
      edges: [],
    });
    return graph;
  });
  fetchMock.get("path:/api/ee/dependencies/graph/dependents", []);

  return server;
}

type SetupOpts = ServerOpts & {
  routes: ReactElement;
  initialRoute: string;
  isAdmin?: boolean;
  collection?: Collection;
};

export function setupMeasurePages({
  routes,
  initialRoute,
  isAdmin = true,
  collection = LIBRARY_COLLECTION,
  ...serverOpts
}: SetupOpts) {
  const server = setupMeasureServer(serverOpts);

  setupDatabasesEndpoints([SAMPLE_DB]);
  setupTablesBulkEndpoints();
  setupUsersEndpoints([createMockUserListResult()]);
  setupUserAcknowledgementEndpoints({
    key: "seen-publish-tables-info",
    value: false,
  });
  setupLibraryEndpoints();
  setupCollectionByIdEndpoint({ collections: [collection] });

  // The plugins read the token features when they initialize, so the settings
  // have to be in place first.
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "has-user-setup": true,
      "token-features": createMockTokenFeatures({
        dependencies: true,
        library: true,
        remote_sync: true,
      }),
    }),
  });
  setupEnterprisePlugins();

  const { router } = renderWithProviders(routes, {
    withRouter: true,
    withUndos: true,
    initialRoute,
    storeInitialState: state,
  });

  return {
    server,
    getPathname: () => router?.location.pathname,
  };
}
