import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

import { Api } from "./api";
import { fieldApi } from "./field";
import { retryDroppedRefetches } from "./retry-dropped-refetch";
import { tableApi } from "./table";

const TABLE_ID = 1;
const FIELD_ID = 10;

let activeStore: ReturnType<typeof getStore> | undefined;

function setup({ withMiddleware }: { withMiddleware: boolean }) {
  let releaseRefetch = () => {};
  const heldRefetch = new Promise<void>((resolve) => {
    releaseRefetch = () => resolve();
  });
  const makeTable = (fieldName: string) =>
    createMockTable({
      id: TABLE_ID,
      fields: [createMockField({ id: FIELD_ID, display_name: fieldName })],
    });

  let metadataCalls = 0;
  fetchMock.get(`path:/api/table/${TABLE_ID}/query_metadata`, () => {
    metadataCalls += 1;
    if (metadataCalls === 1) {
      return makeTable("Initial");
    }
    if (metadataCalls === 2) {
      return heldRefetch.then(() => makeTable("AfterChange"));
    }
    return makeTable("AfterUndo");
  });
  fetchMock.put(`path:/api/field/${FIELD_ID}`, { id: FIELD_ID });

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
    ...(withMiddleware ? [retryDroppedRefetches] : []),
  ]);
  activeStore = store;

  const cachedFieldName = () => {
    const queries =
      // The store is typed from its reducers, so the RTK Query slice is opaque.
      (
        store.getState() as unknown as Record<
          string,
          {
            queries: Record<
              string,
              { data?: { id: number; fields?: { display_name: string }[] } }
            >;
          }
        >
      )[Api.reducerPath].queries;

    return Object.values(queries).find((entry) => entry.data?.id === TABLE_ID)
      ?.data?.fields?.[0].display_name;
  };

  const subscribe = () =>
    store.dispatch(
      tableApi.endpoints.getTableQueryMetadata.initiate({ id: TABLE_ID }),
    );

  const renameField = (name: string) =>
    store.dispatch(
      fieldApi.endpoints.updateField.initiate({
        id: FIELD_ID,
        display_name: name,
      }),
    );

  return {
    cachedFieldName,
    metadataCalls: () => metadataCalls,
    releaseRefetch,
    renameField,
    subscribe,
  };
}

/**
 * Reproduces the refetch RTK Query drops: a re-subscribe during a change's
 * in-flight refetch is condition-rejected, so the undo's invalidation flushes
 * early, its refetch is rejected too, and the stale response stays cached.
 */
async function runDroppedRefetchScenario(withMiddleware: boolean) {
  const {
    cachedFieldName,
    metadataCalls,
    releaseRefetch,
    renameField,
    subscribe,
  } = setup({ withMiddleware });

  subscribe();
  await waitFor(() => expect(cachedFieldName()).toBe("Initial"));

  await renameField("AfterChange");
  await waitFor(() => expect(metadataCalls()).toBe(2));

  subscribe();
  await renameField("AfterUndo");
  releaseRefetch();

  return { cachedFieldName, metadataCalls };
}

describe("retryDroppedRefetches", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("re-runs the refetch RTK Query dropped, so the cache converges on the undone value", async () => {
    const { cachedFieldName, metadataCalls } =
      await runDroppedRefetchScenario(true);

    await waitFor(() => expect(cachedFieldName()).toBe("AfterUndo"));
    expect(metadataCalls()).toBe(3);
  });

  it("without the middleware the stale in-flight response wins permanently", async () => {
    const { cachedFieldName, metadataCalls } =
      await runDroppedRefetchScenario(false);

    await waitFor(() => expect(cachedFieldName()).toBe("AfterChange"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cachedFieldName()).toBe("AfterChange");
    expect(metadataCalls()).toBe(2);
  });
});
