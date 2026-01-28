import userEvent from "@testing-library/user-event";
import type { Location } from "history";
import { Route } from "react-router";

import {
  setupListBrokenGraphNodesEndpoint,
  setupListUnreferencedGraphNodesEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
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
import { getPageUrl } from "./utils";

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
  mode?: DependencyListMode;
  location?: Pick<Location<DependencyListQueryParams>, "query">;
  nodes?: DependencyNode[];
  lastUsedParams?: DependencyListUserParams;
};

function setup({
  mode = "broken",
  location = { query: {} },
  nodes = [],
  lastUsedParams = {},
}: SetupOpts) {
  const path = getPageUrl(mode, {});

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

  setupUserKeyValueEndpoints({
    namespace: "dependency_list",
    key: mode,
    value: lastUsedParams,
  });

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const { history } = renderWithProviders(
    <Route
      path={path}
      component={() => <DependencyListPage mode={mode} location={location} />}
    />,
    {
      withRouter: true,
      initialRoute: path,
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );

  return { history };
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

describe("DependencyListPage", () => {
  describe("list", () => {
    it("renders provided nodes in the list", async () => {
      setup({ nodes: CARD_NODES });

      expect(await screen.findByText("Question 1")).toBeInTheDocument();
      expect(await screen.findByText("Question 2")).toBeInTheDocument();
    });
  });

  describe("last used params", () => {
    it("should use default filters when there are no query string or last used parameters", async () => {
      setup({
        nodes: CARD_NODES,
        location: { query: {} },
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
        location: { query: {} },
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
        location: { query: { group_types: ["question"] } },
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
        location: { query: { group_types: ["model"] } },
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
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        location: { query: {} },
        lastUsedParams: { group_types: ["table", "question"] },
      });

      await waitForListToLoad();

      const currentLocation = history?.getCurrentLocation();
      expect(currentLocation?.query).toEqual({
        group_types: ["table", "question"],
      });
    });
  });
});
