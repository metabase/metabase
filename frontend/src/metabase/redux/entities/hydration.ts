import { type Middleware, isFulfilled } from "@reduxjs/toolkit";
import type { Schema } from "normalizr";

import {
  automagicDashboardsApi,
  cardApi,
  collectionApi,
  dashboardApi,
  databaseApi,
  datasetApi,
  fieldApi,
  measureApi,
  metricApi,
  segmentApi,
  snippetApi,
  tableApi,
} from "metabase/api";
import { updateMetadata } from "metabase/redux/metadata";
import {
  DatabaseSchema,
  FieldSchema,
  ForeignKeySchema,
  MeasureSchema,
  MetricSchema,
  ObjectUnionSchema,
  QueryMetadataSchema,
  QuestionSchema,
  SchemaSchema,
  SegmentSchema,
  SnippetSchema,
  TableSchema,
} from "metabase/schema";
import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type { DatabaseId, SchemaName } from "metabase-types/api";

/**
 * The part of an RTK Query endpoint a rule needs. Structural, so a real
 * endpoint satisfies it and infers both type parameters.
 */
type HydratingEndpoint<Response, Arg> = {
  name: string;
  Types: { ResultType: Response; QueryArg: Arg };
};

type HydrationRule = {
  endpointName: string;
  schema: Schema;
  toEntities: (response: unknown, arg: unknown) => unknown;
};

function hydrates<Response, Arg>(
  endpoint: HydratingEndpoint<Response, Arg>,
  schema: Schema,
  select: (response: Response, arg: Arg) => unknown = (response) => response,
): HydrationRule {
  return {
    endpointName: endpoint.name,
    schema,
    // The middleware finds this rule by the endpoint name the action carries,
    // so the payload and original args are always this endpoint's types.
    toEntities: (response, arg) => select(response as Response, arg as Arg),
  };
}

/**
 * No endpoint returns schema records. The schema list endpoints return bare
 * names, so the id has to be rebuilt from the database the caller asked about.
 */
const toNormalizedSchemas = (
  databaseId: DatabaseId,
  schemaNames: SchemaName[],
) =>
  schemaNames.map((schemaName) => ({
    id: generateSchemaId(databaseId, schemaName),
    name: schemaName,
    database: { id: databaseId },
  }));

/**
 * Every endpoint whose payload flows into `getMetadata`.
 *
 * `getMetadata` in `metabase/selectors/metadata.ts` stitches one logical object
 * together from several endpoints' payloads, so each of these has to reach
 * `state.entities` on success. This table is the only place that happens.
 *
 * Adding an endpoint here starts hydrating every one of its callers, which is a
 * behaviour change. `hydration.unit.spec.ts` fails on any edit to the set.
 */
const HYDRATION_RULES: HydrationRule[] = [
  hydrates(
    databaseApi.endpoints.listDatabases,
    [DatabaseSchema],
    (response) => response.data,
  ),
  hydrates(databaseApi.endpoints.getDatabase, DatabaseSchema),
  hydrates(databaseApi.endpoints.getDatabaseMetadata, DatabaseSchema),
  hydrates(
    databaseApi.endpoints.listDatabaseSchemas,
    [SchemaSchema],
    (schemaNames, { id }) => toNormalizedSchemas(id, schemaNames),
  ),
  hydrates(
    databaseApi.endpoints.listSyncableDatabaseSchemas,
    [SchemaSchema],
    (schemaNames, databaseId) => toNormalizedSchemas(databaseId, schemaNames),
  ),
  hydrates(databaseApi.endpoints.listDatabaseSchemaTables, [TableSchema]),
  hydrates(databaseApi.endpoints.listVirtualDatabaseTables, [TableSchema]),
  hydrates(databaseApi.endpoints.listDatabaseIdFields, [FieldSchema]),

  hydrates(tableApi.endpoints.listTables, [TableSchema]),
  hydrates(tableApi.endpoints.getTable, TableSchema),
  hydrates(tableApi.endpoints.getTableQueryMetadata, TableSchema),
  hydrates(tableApi.endpoints.listTableForeignKeys, [ForeignKeySchema]),

  hydrates(fieldApi.endpoints.getField, FieldSchema),

  hydrates(cardApi.endpoints.listCards, [QuestionSchema]),
  hydrates(cardApi.endpoints.getCard, QuestionSchema),
  hydrates(cardApi.endpoints.getCardQueryMetadata, QueryMetadataSchema),
  hydrates(cardApi.endpoints.createCard, QuestionSchema),
  hydrates(cardApi.endpoints.updateCard, QuestionSchema),

  hydrates(
    dashboardApi.endpoints.getDashboardQueryMetadata,
    QueryMetadataSchema,
  ),

  hydrates(datasetApi.endpoints.getAdhocQueryMetadata, QueryMetadataSchema),

  hydrates(
    automagicDashboardsApi.endpoints.getXrayDashboardQueryMetadata,
    QueryMetadataSchema,
  ),
  hydrates(
    automagicDashboardsApi.endpoints.getXrayDashboardForModel,
    QueryMetadataSchema,
  ),

  hydrates(segmentApi.endpoints.listSegments, [SegmentSchema]),
  hydrates(segmentApi.endpoints.getSegment, SegmentSchema),

  hydrates(
    metricApi.endpoints.listMetrics,
    [MetricSchema],
    (response) => response.data,
  ),
  hydrates(metricApi.endpoints.getMetric, MetricSchema),

  hydrates(measureApi.endpoints.listMeasures, [MeasureSchema]),
  hydrates(measureApi.endpoints.getMeasure, MeasureSchema),

  hydrates(snippetApi.endpoints.listSnippets, [SnippetSchema]),
  hydrates(snippetApi.endpoints.getSnippet, SnippetSchema),
  hydrates(snippetApi.endpoints.createSnippet, SnippetSchema),
  hydrates(snippetApi.endpoints.updateSnippet, SnippetSchema),

  hydrates(
    collectionApi.endpoints.listCollectionItems,
    [ObjectUnionSchema],
    (response) => response.data,
  ),
];

export const HYDRATED_ENDPOINT_NAMES = HYDRATION_RULES.map(
  (rule) => rule.endpointName,
);

const RULES_BY_ENDPOINT = new Map(
  HYDRATION_RULES.map((rule) => [rule.endpointName, rule]),
);

type FulfilledQueryArg = {
  endpointName: string;
  originalArgs: unknown;
};

function getFulfilledQueryArg(action: unknown): FulfilledQueryArg | undefined {
  if (!isFulfilled(action)) {
    return undefined;
  }
  const { arg } = action.meta;
  if (
    arg != null &&
    typeof arg === "object" &&
    "endpointName" in arg &&
    typeof arg.endpointName === "string"
  ) {
    return {
      endpointName: arg.endpointName,
      originalArgs: "originalArgs" in arg ? arg.originalArgs : undefined,
    };
  }
  return undefined;
}

/**
 * The single writer into `state.entities`.
 *
 * Each hydrating endpoint used to mirror its own response from
 * `onQueryStarted`, which put an upward `metabase/api` to `metabase/redux`
 * import in ten files. The write now happens once, here, after the RTK cache
 * has taken the response.
 */
export const metadataHydrationMiddleware: Middleware =
  ({ dispatch }) =>
  (next) =>
  (action) => {
    const result = next(action);

    const arg = getFulfilledQueryArg(action);
    const rule = arg && RULES_BY_ENDPOINT.get(arg.endpointName);
    if (!arg || !rule || !isFulfilled(action)) {
      return result;
    }

    const { payload } = action;
    if (payload == null) {
      return result;
    }

    // `normalize` throws on anything that is not an object, and two responses
    // reach here that are not one: a redirect resolves the request with a
    // string body, and a list response that omits its rows selects `undefined`.
    // Both used to land inside the `try` in `handleQueryFulfilled`, so the
    // throw was swallowed and nothing was written. Skip them explicitly rather
    // than keep a catch that would also hide real faults.
    const entities = rule.toEntities(payload, arg.originalArgs);
    if (entities == null || typeof entities !== "object") {
      return result;
    }

    // Deferred, not written here. Each endpoint used to write from
    // `onQueryStarted`, which runs on `await queryFulfilled`, so the write
    // always landed after RTK Query had finished with the action. Writing
    // synchronously re-enters the middleware chain while the fulfilled action
    // is still unwinding, and reorders that work against the render it
    // triggers. `AddCardSidebar.unit.spec.tsx` catches it.
    //
    // A promise and not `queueMicrotask`: Jest's fake timers replace
    // `queueMicrotask`, so a spec that drives polling by hand would never
    // flush the write.
    Promise.resolve().then(() =>
      dispatch(updateMetadata(entities, rule.schema)),
    );

    return result;
  };
