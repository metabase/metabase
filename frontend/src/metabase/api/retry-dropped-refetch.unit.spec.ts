import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { createMockTable } from "metabase-types/api/mocks";

import { Api } from "./api";
import { retryDroppedRefetches } from "./retry-dropped-refetch";
import { tableApi } from "./table";

const TABLE_ID = 1;
function runningQueryCacheKey(store: ReturnType<typeof getStore>) {
  const [running] = store.dispatch(Api.util.getRunningQueriesThunk());
  return running.queryCacheKey;
}

/** Mirrors the action RTK Query dispatches when it declines to run a refetch. */
function droppedRefetchAction(queryCacheKey: string) {
  return {
    type: `${Api.reducerPath}/executeQuery/rejected`,
    error: { message: "Aborted due to condition callback returning false." },
    meta: {
      condition: true,
      requestStatus: "rejected",
      aborted: false,
      requestId: "request-id",
      arg: {
        type: "query",
        subscribe: false,
        forceRefetch: true,
        endpointName: "getTableQueryMetadata",
        originalArgs: { id: TABLE_ID },
        queryCacheKey,
      },
    },
  };
}

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });

  fetchMock.get(`path:/api/table/${TABLE_ID}/query_metadata`, () =>
    held.then(() => createMockTable({ id: TABLE_ID })),
  );

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
    retryDroppedRefetches,
  ]);
  activeStore = store;

  // `findRequests` flushes pending calls, which would wait on the held response.
  const metadataCalls = () =>
    fetchMock.callHistory
      .calls()
      .filter((call) => call.url.includes("query_metadata")).length;

  const dispatchDropped = (queryCacheKey: string) =>
    store.dispatch(
      // The store is typed from its reducers; this is RTK Query's internal
      // thunk action, which the middleware reacts to.
      droppedRefetchAction(queryCacheKey) as never,
    );

  return { store, metadataCalls, dispatchDropped, release };
}

describe("retryDroppedRefetches", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("re-runs a dropped refetch once the in-flight request settles", async () => {
    const { store, metadataCalls, dispatchDropped, release } = setup();

    store.dispatch(
      tableApi.endpoints.getTableQueryMetadata.initiate({ id: TABLE_ID }),
    );
    await waitFor(() => {
      expect(metadataCalls()).toBe(1);
    });

    dispatchDropped(runningQueryCacheKey(store));
    expect(metadataCalls()).toBe(1);

    release();

    await waitFor(() => {
      expect(metadataCalls()).toBe(2);
    });
  });

  it("ignores a dropped refetch for a different cache entry", async () => {
    const { store, metadataCalls, dispatchDropped, release } = setup();

    store.dispatch(
      tableApi.endpoints.getTableQueryMetadata.initiate({ id: TABLE_ID }),
    );
    await waitFor(() => {
      expect(metadataCalls()).toBe(1);
    });

    dispatchDropped('getTableQueryMetadata({"id":999})');
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(metadataCalls()).toBe(1);
  });
});
