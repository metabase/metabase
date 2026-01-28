import type { Location } from "history";
import { Route } from "react-router";

import {
  setupListBrokenGraphNodesEndpoint,
  setupListUnreferencedGraphNodesEndpoint,
  setupNullGetUserKeyValueEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type {
  DependencyListUserParams,
  DependencyNode,
} from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockListBrokenGraphNodesResponse,
  createMockListUnreferencedGraphNodesResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import type { DependencyListMode } from "../../components/DependencyList/types";

import { DependencyListPage } from "./DependencyListPage";
import type { DependencyListQueryParams } from "./types";

type SetupOpts = {
  mode?: DependencyListMode;
  location?: Pick<Location<DependencyListQueryParams>, "query">;
  nodes?: DependencyNode[];
  lastUsedParams?: DependencyListUserParams;
};

function setup({
  mode = "broken",
  location = { query: {} },
  nodes = [],
  lastUsedParams,
}: SetupOpts) {
  if (mode === "broken") {
    setupListBrokenGraphNodesEndpoint(
      createMockListBrokenGraphNodesResponse({
        data: nodes,
        total: nodes.length,
      }),
    );
  } else {
    setupListUnreferencedGraphNodesEndpoint(
      createMockListUnreferencedGraphNodesResponse({
        data: nodes,
        total: nodes.length,
      }),
    );
  }

  if (lastUsedParams != null) {
    setupUserKeyValueEndpoints({
      namespace: "dependency_list",
      key: mode,
      value: lastUsedParams,
    });
  } else {
    setupNullGetUserKeyValueEndpoints();
  }

  mockGetBoundingClientRect({ width: 100, height: 100 });

  renderWithProviders(
    <Route
      path="/"
      component={() => <DependencyListPage mode={mode} location={location} />}
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );
}

describe("DependencyListPage", () => {
  it("renders provided nodes in the list", async () => {
    const nodes = [
      createMockCardDependencyNode({
        id: 1,
        data: createMockCardDependencyNodeData({ name: "Question 1" }),
      }),
      createMockCardDependencyNode({
        id: 2,
        data: createMockCardDependencyNodeData({ name: "Question 2" }),
      }),
    ];

    setup({ nodes });

    expect(await screen.findByText("Question 1")).toBeInTheDocument();
    expect(await screen.findByText("Question 2")).toBeInTheDocument();
  });
});
