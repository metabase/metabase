import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupListBreakingGraphNodesEndpoint,
  setupListUnreferencedGraphNodesEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import type * as Urls from "metabase/lib/urls";
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

import {
  BrokenDependencyListPage,
  UnreferencedDependencyListPage,
} from "./DependencyListPage";
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
  nodes?: DependencyNode[];
  total?: number;
  urlParams?: Urls.DependencyListParams;
  lastUsedParams?: DependencyListUserParams;
};

function setup({
  mode = "broken",
  nodes = [],
  total,
  urlParams = {},
  lastUsedParams = {},
}: SetupOpts) {
  if (mode === "broken") {
    setupListBreakingGraphNodesEndpoint(
      createMockListBrokenGraphNodesResponse({
        data: nodes,
        total: total ?? nodes.length,
      }),
    );
  } else {
    setupListUnreferencedGraphNodesEndpoint(
      createMockListUnreferencedGraphNodesResponse({
        data: nodes,
        total: total ?? nodes.length,
      }),
    );
  }

  setupUserKeyValueEndpoints({
    namespace: "dependency_list",
    key: mode,
    value: lastUsedParams,
  });

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const PageComponent =
    mode === "broken"
      ? BrokenDependencyListPage
      : UnreferencedDependencyListPage;

  const { history } = renderWithProviders(
    <Route path={getPageUrl(mode, {})} component={PageComponent} />,
    {
      withRouter: true,
      initialRoute: getPageUrl(mode, urlParams),
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

  describe("URL parameters", () => {
    it("should set the group-types parameter when not all types are selected", async () => {
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["table", "question", "model"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      await userEvent.click(getTypeCheckbox(popover, "Table"));

      expect(history?.getCurrentLocation().query).toEqual({
        "group-types": ["question", "model"],
      });
    });

    it("should not set the group-types parameter when all types are selected", async () => {
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["table", "question"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      await userEvent.click(getTypeCheckbox(popover, "Model"));

      expect(history?.getCurrentLocation().query).toEqual({});
    });

    it("should set the include-personal-collections parameter when it is unchecked", async () => {
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { includePersonalCollections: true },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      const checkbox = within(popover).getByRole("checkbox", {
        name: "Include items in personal collections",
      });
      await userEvent.click(checkbox);

      expect(history?.getCurrentLocation().query).toEqual({
        "include-personal-collections": "false",
      });
    });

    it("should not set the include-personal-collections parameter when it is checked", async () => {
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { includePersonalCollections: false },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      const checkbox = within(popover).getByRole("checkbox", {
        name: "Include items in personal collections",
      });
      await userEvent.click(checkbox);

      expect(history?.getCurrentLocation().query).toEqual({});
    });

    it("should set the page parameter when navigating to the next page and it is not the first page", async () => {
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        total: 50,
        urlParams: {},
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Next page"));

      expect(history?.getCurrentLocation().query).toEqual({ page: "1" });
    });

    it("should set the page parameter when navigating to the previous page and it is not the first page", async () => {
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        total: 50,
        urlParams: { page: 2 },
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Previous page"));

      expect(history?.getCurrentLocation().query).toEqual({ page: "1" });
    });

    it("should not set the page parameter when it is the first page", async () => {
      const { history } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { page: 1 },
        total: 50,
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Previous page"));

      expect(history?.getCurrentLocation().query).toEqual({});
    });
  });

  describe("last used params", () => {
    it("should use default filters when there are no query string or last used parameters", async () => {
      setup({
        nodes: CARD_NODES,
        urlParams: {},
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
        urlParams: {},
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
        urlParams: { groupTypes: ["question"] },
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
        urlParams: { groupTypes: ["model"] },
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
        urlParams: {},
        lastUsedParams: { group_types: ["table", "question"] },
      });

      await waitForListToLoad();

      const currentLocation = history?.getCurrentLocation();
      expect(currentLocation?.query).toEqual({
        "group-types": ["table", "question"],
      });
    });
  });
});
