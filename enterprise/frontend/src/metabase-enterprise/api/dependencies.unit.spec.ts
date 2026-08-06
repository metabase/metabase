import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupListBreakingGraphNodesEndpoint,
  setupListUnreferencedGraphNodesEndpoint,
} from "__support__/server-mocks";
import { Api } from "metabase/api";
import {
  createMockListBrokenGraphNodesResponse,
  createMockListUnreferencedGraphNodesResponse,
} from "metabase-types/api/mocks";

import { dependencyApi } from "./dependencies";

const UNREFERENCED_URL = "path:/api/ee/dependencies/graph/unreferenced";
const BREAKING_URL = "path:/api/ee/dependencies/graph/breaking";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  setupListUnreferencedGraphNodesEndpoint(
    createMockListUnreferencedGraphNodesResponse(),
  );
  setupListBreakingGraphNodesEndpoint(createMockListBrokenGraphNodesResponse());

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  return { store };
}

async function lastCallUrl(matcher: string) {
  await waitFor(() => {
    expect(fetchMock.callHistory.called(matcher)).toBe(true);
  });
  return fetchMock.callHistory.lastCall(matcher)?.request?.url ?? "";
}

describe("dependencyApi", () => {
  afterEach(() => {
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  describe("listUnreferencedGraphNodes", () => {
    it("scopes the request to a worktree when worktree-id is given", async () => {
      const { store } = setup();

      store.dispatch(
        dependencyApi.endpoints.listUnreferencedGraphNodes.initiate({
          "worktree-id": 7,
        }),
      );

      expect(await lastCallUrl(UNREFERENCED_URL)).toContain("worktree-id=7");
    });

    it("sends no worktree-id when unscoped", async () => {
      const { store } = setup();

      store.dispatch(
        dependencyApi.endpoints.listUnreferencedGraphNodes.initiate({}),
      );

      expect(await lastCallUrl(UNREFERENCED_URL)).not.toContain("worktree-id");
    });
  });

  describe("listBreakingGraphNodes", () => {
    it("scopes the request to a worktree when worktree-id is given", async () => {
      const { store } = setup();

      store.dispatch(
        dependencyApi.endpoints.listBreakingGraphNodes.initiate({
          "worktree-id": 7,
        }),
      );

      expect(await lastCallUrl(BREAKING_URL)).toContain("worktree-id=7");
    });

    it("sends no worktree-id when unscoped", async () => {
      const { store } = setup();

      store.dispatch(
        dependencyApi.endpoints.listBreakingGraphNodes.initiate({}),
      );

      expect(await lastCallUrl(BREAKING_URL)).not.toContain("worktree-id");
    });
  });
});
