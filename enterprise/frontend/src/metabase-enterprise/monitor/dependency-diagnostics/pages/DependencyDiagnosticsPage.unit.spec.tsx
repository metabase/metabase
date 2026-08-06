import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

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
import { WorktreeProvider } from "metabase/common/worktrees";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import type * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import type { DependencyDiagnosticsMode } from "metabase-enterprise/monitor/dependency-diagnostics/components/types";
import type {
  DependencyDiagnosticsUserParams,
  DependencyNode,
  WorktreeId,
} from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockListBrokenGraphNodesResponse,
  createMockListUnreferencedGraphNodesResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  BrokenDependencyDiagnosticsPage,
  UnreferencedDependencyDiagnosticsPage,
} from "./DependencyDiagnosticsPage";
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
  mode?: DependencyDiagnosticsMode;
  nodes?: DependencyNode[];
  total?: number;
  urlParams?: Urls.DependencyDiagnosticsParams;
  lastUsedParams?: DependencyDiagnosticsUserParams;
  worktreeId?: WorktreeId;
};

function setup({
  mode = "broken",
  nodes = [],
  total,
  urlParams = {},
  lastUsedParams = {},
  worktreeId,
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
    namespace: "dependency_diagnostics",
    key: mode,
    value: lastUsedParams,
  });

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const PageComponent =
    mode === "broken"
      ? BrokenDependencyDiagnosticsPage
      : UnreferencedDependencyDiagnosticsPage;

  const content = (
    <MonitorContent>
      <PageComponent />
    </MonitorContent>
  );

  const { router } = renderWithProviders(
    <Route
      path={getPageUrl(mode, {})}
      element={
        worktreeId !== undefined ? (
          <WorktreeProvider worktreeId={worktreeId}>{content}</WorktreeProvider>
        ) : (
          content
        )
      }
    />,
    {
      withRouter: true,
      initialRoute: getPageUrl(mode, urlParams),
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );

  return { router };
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

describe("DependencyDiagnosticsPage", () => {
  describe("list", () => {
    it("renders provided nodes in the list", async () => {
      setup({ nodes: CARD_NODES });

      const list = await screen.findByRole("treegrid");
      expect(await within(list).findByText("Question 1")).toBeInTheDocument();
      expect(await within(list).findByText("Question 2")).toBeInTheDocument();
    });

    it("renders selected row details in the Monitor sidebar outlet", async () => {
      setup({ nodes: CARD_NODES });

      const list = await screen.findByRole("treegrid");
      await userEvent.click(await within(list).findByText("Question 1"));

      const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
      expect(sidebarRegion).toHaveTextContent("Question 1");
    });
  });

  describe("worktree scoping", () => {
    it("scopes the breaking nodes request to the worktree when rendered inside one", async () => {
      setup({ mode: "broken", nodes: CARD_NODES, worktreeId: 7 });

      await waitForListToLoad();

      const calls = fetchMock.callHistory.calls(
        "path:/api/ee/dependencies/graph/breaking",
      );
      expect(calls).not.toHaveLength(0);
      expect(calls[0].url).toContain("worktree-id=7");
    });

    it("scopes the unreferenced nodes request to the worktree when rendered inside one", async () => {
      setup({ mode: "unreferenced", nodes: CARD_NODES, worktreeId: 7 });

      await waitForListToLoad();

      const calls = fetchMock.callHistory.calls(
        "path:/api/ee/dependencies/graph/unreferenced",
      );
      expect(calls).not.toHaveLength(0);
      expect(calls[0].url).toContain("worktree-id=7");
    });

    it("does not send worktree-id outside a worktree", async () => {
      setup({ mode: "broken", nodes: CARD_NODES });

      await waitForListToLoad();

      const calls = fetchMock.callHistory.calls(
        "path:/api/ee/dependencies/graph/breaking",
      );
      expect(calls).not.toHaveLength(0);
      expect(calls[0].url).not.toContain("worktree-id");
    });
  });

  describe("URL parameters", () => {
    it("should set the group-types parameter when not all types are selected", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["table", "question", "model"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      await userEvent.click(getTypeCheckbox(popover, "Table"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        "group-types": ["question", "model"],
      });
    });

    it("should not set the group-types parameter when all types are selected", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { groupTypes: ["table", "question", "transform"] },
      });

      await waitForListToLoad();
      await userEvent.click(await getFilterButton());
      const popover = await getFilterPopover();
      await userEvent.click(getTypeCheckbox(popover, "Model"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
    });

    it("should set the include-personal-collections parameter when it is unchecked", async () => {
      const { router } = setup({
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

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        "include-personal-collections": "false",
      });
    });

    it("should not set the include-personal-collections parameter when it is checked", async () => {
      const { router } = setup({
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

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
    });

    it("should set the page parameter when navigating to the next page and it is not the first page", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        total: 50,
        urlParams: {},
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Next page"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        page: "1",
      });
    });

    it("should set the page parameter when navigating to the previous page and it is not the first page", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        total: 50,
        urlParams: { page: 2 },
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Previous page"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({
        page: "1",
      });
    });

    it("should not set the page parameter when it is the first page", async () => {
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: { page: 1 },
        total: 50,
      });

      await waitForListToLoad();
      await userEvent.click(screen.getByLabelText("Previous page"));

      expect(parseSearchQuery(router?.location.search ?? "")).toEqual({});
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
      const { router } = setup({
        mode: "broken",
        nodes: CARD_NODES,
        urlParams: {},
        lastUsedParams: { group_types: ["table", "question"] },
      });

      await waitForListToLoad();

      const currentLocation = router?.location;
      expect(parseSearchQuery(currentLocation?.search ?? "")).toEqual({
        "group-types": ["table", "question"],
      });
    });
  });
});
