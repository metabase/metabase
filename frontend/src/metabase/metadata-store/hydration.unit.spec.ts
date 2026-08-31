import type { Dispatch, MiddlewareAPI } from "@reduxjs/toolkit";

import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";

import {
  HYDRATED_ENDPOINT_NAMES,
  metadataHydrationMiddleware,
} from "./hydration";

/**
 * Every endpoint whose response reaches `state.entities`.
 *
 * Keep this list literal. Dropping an endpoint stops its data reaching
 * `getMetadata` and throws nothing, and adding one starts hydrating every
 * caller of an endpoint that does not hydrate today. Both are behaviour
 * changes that have to be argued in review, not absorbed by a snapshot.
 */
const HYDRATING_ENDPOINTS = [
  "createCard",
  "createDatabase",
  "createSnippet",
  "getAdhocQueryMetadata",
  "getCard",
  "getCardQueryMetadata",
  "getDashboardQueryMetadata",
  "getDatabase",
  "getDatabaseMetadata",
  "getField",
  "getMeasure",
  "getMetric",
  "getSegment",
  "getSnippet",
  "getTable",
  "getTableQueryMetadata",
  "getXrayDashboardForModel",
  "getXrayDashboardQueryMetadata",
  "listCards",
  "listCollectionItems",
  "listDatabaseIdFields",
  "listDatabaseSchemaTables",
  "listDatabaseSchemas",
  "listDatabases",
  "listMeasures",
  "listMetrics",
  "listSegments",
  "listSnippets",
  "listSyncableDatabaseSchemas",
  "listTableForeignKeys",
  "listTables",
  "listVirtualDatabaseTables",
  "updateCard",
  "updateSnippet",
];

type UpdateAction = {
  type: string;
  payload: { entities: Record<string, Record<string, unknown>> };
};

async function runMiddleware(action: unknown): Promise<UpdateAction[]> {
  const dispatched: UpdateAction[] = [];
  // The middleware only ever dispatches `updateMetadata`, so the recorder takes
  // that one shape. Redux types `dispatch` to accept any action.
  const store = {
    dispatch: (dispatchedAction: UpdateAction) => {
      dispatched.push(dispatchedAction);
      return dispatchedAction;
    },
    getState: () => ({}),
  } as unknown as MiddlewareAPI<Dispatch, unknown>;

  metadataHydrationMiddleware(store)((nextAction) => nextAction)(action);
  // The write is deferred by a microtask, so let it run.
  await Promise.resolve();

  return dispatched;
}

function fulfilled(
  endpointName: string,
  payload: unknown,
  originalArgs?: unknown,
) {
  return {
    type: "metabase-api/executeQuery/fulfilled",
    payload,
    meta: {
      requestId: "test-request",
      requestStatus: "fulfilled" as const,
      arg: { endpointName, originalArgs, type: "query" },
    },
  };
}

describe("metadataHydrationMiddleware", () => {
  it("hydrates exactly the endpoints in the list, and no others", () => {
    expect([...HYDRATED_ENDPOINT_NAMES].sort()).toEqual(
      [...HYDRATING_ENDPOINTS].sort(),
    );
  });

  it("registers each endpoint once", () => {
    expect(new Set(HYDRATED_ENDPOINT_NAMES).size).toBe(
      HYDRATED_ENDPOINT_NAMES.length,
    );
  });

  it("defers the write instead of re-entering the action that triggered it", () => {
    const dispatched: UpdateAction[] = [];
    // Same narrowing as `runMiddleware`: the middleware only dispatches
    // `updateMetadata`, while Redux types `dispatch` to accept any action.
    const store = {
      dispatch: (action: UpdateAction) => dispatched.push(action),
      getState: () => ({}),
    } as unknown as MiddlewareAPI<Dispatch, unknown>;

    metadataHydrationMiddleware(store)((nextAction) => nextAction)(
      fulfilled("getTable", { id: 7, name: "Orders" }, { id: 7 }),
    );

    // Writing here would land while the fulfilled action is still unwinding
    // through RTK Query's middleware, which reorders its post-processing.
    expect(dispatched).toEqual([]);
  });

  it("normalizes a response into its slice", async () => {
    const [action] = await runMiddleware(
      fulfilled("getTable", { id: 7, name: "Orders" }, { id: 7 }),
    );

    expect(action.payload.entities.tables["7"]).toEqual(
      expect.objectContaining({ id: 7, name: "Orders" }),
    );
  });

  it("unwraps a list response that nests its rows under `data`", async () => {
    const [action] = await runMiddleware(
      fulfilled("listDatabases", {
        data: [{ id: 1, name: "Sample" }],
        total: 1,
      }),
    );

    expect(action.payload.entities.databases["1"]).toEqual(
      expect.objectContaining({ id: 1, name: "Sample" }),
    );
  });

  it("ignores a list response that omits its rows", async () => {
    // `normalize(undefined)` throws, so the rule's selection is guarded.
    expect(
      await runMiddleware(fulfilled("listDatabases", { total: 0 })),
    ).toEqual([]);
  });

  it("ignores an endpoint that does not hydrate", async () => {
    expect(
      await runMiddleware(fulfilled("getTableData", { rows: [] })),
    ).toEqual([]);
  });

  it("ignores a non-endpoint action", async () => {
    expect(await runMiddleware({ type: "metabase/some/thing" })).toEqual([]);
  });

  it("reports a failed write instead of rejecting", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // The write is deferred, so a throw here would otherwise surface as an
    // unhandled rejection, detached from the endpoint that caused it.
    const store = {
      dispatch: () => {
        throw new Error("reducer blew up");
      },
      getState: () => ({}),
    } as unknown as MiddlewareAPI<Dispatch, unknown>;

    metadataHydrationMiddleware(store)((nextAction) => nextAction)(
      fulfilled("getTable", { id: 7, name: "Orders" }, { id: 7 }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("getTable"),
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("ignores a fulfilled thunk that is not an Api query", async () => {
    // `isFulfilled` matches every async thunk in the app, so a thunk of another
    // slice carrying an `endpointName` must not reach the mirror.
    const foreignThunk = {
      type: "some-other-slice/executeQuery/fulfilled",
      payload: { id: 7, name: "Orders" },
      meta: {
        requestId: "test-request",
        requestStatus: "fulfilled" as const,
        arg: { endpointName: "getTable", originalArgs: { id: 7 } },
      },
    };

    expect(await runMiddleware(foreignThunk)).toEqual([]);
  });

  it("ignores a redirect, which resolves the request with a string body", async () => {
    expect(
      await runMiddleware(fulfilled("getTable", "<html>", { id: 7 })),
    ).toEqual([]);
  });

  describe("schema records, which no endpoint returns", () => {
    it("builds them from an object arg for listDatabaseSchemas", async () => {
      const [action] = await runMiddleware(
        fulfilled("listDatabaseSchemas", ["public"], { id: 3 }),
      );

      const id = generateSchemaId(3, "public");
      expect(action.payload.entities.schemas[id]).toEqual(
        expect.objectContaining({ id, name: "public" }),
      );
    });

    it("builds them from a bare id arg for listSyncableDatabaseSchemas", async () => {
      const [action] = await runMiddleware(
        fulfilled("listSyncableDatabaseSchemas", ["public"], 3),
      );

      const id = generateSchemaId(3, "public");
      expect(action.payload.entities.schemas[id]).toEqual(
        expect.objectContaining({ id, name: "public" }),
      );
    });
  });
});
