import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentProps } from "react";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import {
  createBlock,
  createExploration,
  createPage,
  createQuery,
} from "metabase/explorations/test-utils";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Exploration } from "metabase-types/api";

import type { ExplorationGroupVisualization } from "../components/ExplorationVisualization";
import { ActionToolbar } from "../components/ExplorationVisualization/ActionToolbar";

import { ExplorationPage } from "./ExplorationPage";

type GroupVisualizationProps = ComponentProps<
  typeof ExplorationGroupVisualization
>;

// The chart needs query results and ECharts; the page toolbar is what issues
// the star and hide writes, so render only the real toolbar and a page marker.
jest.mock("../components/ExplorationVisualization", () => ({
  ExplorationGroupVisualization: (props: GroupVisualizationProps) => (
    <>
      <div data-testid="group-viz">{`Chart for page ${props.page.id}`}</div>
      <ActionToolbar
        explorationId={props.explorationId}
        page={props.page}
        charts={[]}
        canAddToSummary={false}
        setSelectedSummary={props.setSelectedSummary}
        commentDrafts={props.commentDrafts}
        setCommentDrafts={props.setCommentDrafts}
        showTimelineDropdown={false}
        availableTimelines={props.availableTimelines}
        selectedTimelineId={props.selectedTimelineId}
        onSelectTimelineId={props.onSelectTimelineId}
        onPreviousPage={props.onPreviousPage}
        onNextPage={props.onNextPage}
      />
    </>
  ),
  ExplorationChartAreaSkeleton: () => null,
}));

const EXPLORATION_ID = 1;
const METRIC_NAME = "Count of orders";

function makeExploration({
  hiddenPageIds = [],
}: { hiddenPageIds?: number[] } = {}): Exploration {
  return createExploration({
    queries: [
      createQuery({ id: 1, name: "Zebra", status: "done" }),
      createQuery({ id: 2, name: "Aardvark", status: "done" }),
    ],
    blocks: [
      createBlock({
        id: 10,
        name: METRIC_NAME,
        pages: [
          createPage({
            id: 1,
            name: "Zebra",
            position: 0,
            query_ids: [1],
            hidden: hiddenPageIds.includes(1),
          }),
          createPage({
            id: 2,
            name: "Aardvark",
            position: 1,
            query_ids: [2],
            hidden: hiddenPageIds.includes(2),
          }),
        ],
      }),
    ],
    thread: { status: "completed", completed_at: "2026-04-30T00:01:00Z" },
  });
}

interface SetupOpts {
  exploration?: Exploration;
  initialRoute?: string;
  writeStatus?: number;
}

function setup({
  exploration = makeExploration(),
  initialRoute = Urls.exploration(EXPLORATION_ID),
  writeStatus = 204,
}: SetupOpts = {}) {
  fetchMock.removeRoutes().clearHistory();
  fetchMock.get(`path:/api/exploration/${exploration.id}`, exploration);
  fetchMock.get("path:/api/comment", { comments: [] });
  fetchMock.get("path:/api/timeline", []);
  fetchMock.get("express:/api/exploration/query/:id", {
    data: { rows: [], cols: [] },
  });
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [],
    tables: [],
    fields: [],
  });
  fetchMock.put("path:/api/exploration/pages/hidden", writeStatus);
  fetchMock.put("express:/api/exploration/page/:id/starred", writeStatus);

  const { router, unmount } = renderWithProviders(
    <Route
      path={`/${Urls.EXPLORATION_BASE_PATH}/:id/page?/:pageId?`}
      element={<ExplorationPage />}
    />,
    { withRouter: true, withUndos: true, initialRoute },
  );
  if (!router) {
    throw new Error("expected router");
  }
  return { router, unmount };
}

function getPageRow(name: string) {
  return screen.getByRole("treeitem", { name: new RegExp(name) });
}

function getPageRowNames() {
  return screen
    .getAllByRole("treeitem")
    .map((row) => row.textContent?.trim() ?? "");
}

async function waitForPageRows(names: string[]) {
  await waitFor(() => {
    expect(getPageRowNames()).toEqual(names);
  });
}

function filterToggle() {
  return screen.getByTestId("exploration-show-hidden-toggle");
}

function writeCalls(url: string) {
  return fetchMock.callHistory.calls(url, { method: "PUT" });
}

describe("ExplorationPage sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("selects a clicked page, shows its chart, and keeps the timeline param", async () => {
    const { router } = setup({
      initialRoute: `${Urls.exploration(EXPLORATION_ID)}/page/1?timeline=7`,
    });
    await waitForPageRows(["Zebra", "Aardvark"]);

    expect(getPageRow("Zebra")).toHaveAttribute("aria-selected", "true");
    expect(getPageRow("Aardvark")).toHaveAttribute("aria-selected", "false");

    await userEvent.click(getPageRow("Aardvark"));

    expect(getPageRow("Aardvark")).toHaveAttribute("aria-selected", "true");
    expect(getPageRow("Zebra")).toHaveAttribute("aria-selected", "false");
    expect(router.location.pathname).toBe(
      `${Urls.exploration(EXPLORATION_ID)}/page/2`,
    );
    expect(new URLSearchParams(router.location.search).get("timeline")).toBe(
      "7",
    );
    expect(screen.getByTestId("group-viz")).toHaveTextContent(
      "Chart for page 2",
    );
  });

  it("switches to the Stars and Discussions tabs through the URL and shows their empty messages", async () => {
    const { router } = setup();
    await waitForPageRows(["Zebra", "Aardvark"]);

    await userEvent.click(screen.getByRole("radio", { name: /Stars/ }));

    expect(new URLSearchParams(router.location.search).get("tab")).toBe(
      "stars",
    );
    expect(screen.getByText("Nothing's been starred yet.")).toBeInTheDocument();
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: /Discussions/ }));

    expect(new URLSearchParams(router.location.search).get("tab")).toBe(
      "discussions",
    );
    expect(screen.getByText("No discussions yet.")).toBeInTheDocument();
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);

    await userEvent.click(screen.getByRole("radio", { name: /All/ }));

    expect(getPageRowNames()).toHaveLength(2);
  });

  it("remembers the alphabetical sort order for the exploration across a reload", async () => {
    const { unmount } = setup();
    await waitForPageRows(["Zebra", "Aardvark"]);

    await userEvent.click(filterToggle());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Alphabetical/ }),
    );

    expect(getPageRowNames()).toEqual(["Aardvark", "Zebra"]);
    expect(filterToggle()).toHaveAttribute("aria-pressed", "false");

    unmount();
    setup();

    await waitForPageRows(["Aardvark", "Zebra"]);
    expect(filterToggle()).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(filterToggle());
    expect(
      await screen.findByRole("menuitem", { name: /Alphabetical/ }),
    ).toHaveAttribute("data-checked", "true");
  });

  it("reveals hidden pages with a Hidden marker from the Show hidden items toggle", async () => {
    setup({ exploration: makeExploration({ hiddenPageIds: [1] }) });
    await waitForPageRows(["Aardvark"]);

    expect(filterToggle()).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(filterToggle());
    await userEvent.click(
      await screen.findByTestId("exploration-show-hidden-item"),
    );

    expect(filterToggle()).toHaveAttribute("aria-pressed", "true");
    expect(getPageRowNames()).toHaveLength(2);
    expect(
      within(getPageRow("Zebra")).getByLabelText("Hidden"),
    ).toBeInTheDocument();
    expect(
      within(getPageRow("Aardvark")).queryByLabelText("Hidden"),
    ).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(filterToggle());
    await userEvent.click(
      await screen.findByTestId("exploration-show-hidden-item"),
    );

    expect(filterToggle()).toHaveAttribute("aria-pressed", "false");
    expect(getPageRowNames()).toEqual(["Aardvark"]);
  });

  describe("optimistic star and hide updates", () => {
    const pageRoute = `${Urls.exploration(EXPLORATION_ID)}/page/1`;

    it("removes a page hidden with the h shortcut from the sidebar tree", async () => {
      setup({ initialRoute: pageRoute });
      await waitForPageRows(["Zebra", "Aardvark"]);

      fireEvent.keyDown(document.body, { key: "h" });

      await waitForPageRows(["Aardvark"]);
      expect(writeCalls("path:/api/exploration/pages/hidden")).toHaveLength(1);
    });

    it("removes every page of a group hidden from its menu from the sidebar tree", async () => {
      setup({ initialRoute: pageRoute });
      await waitForPageRows(["Zebra", "Aardvark"]);

      const heading = screen.getByRole("group", {
        name: new RegExp(METRIC_NAME),
      });
      await userEvent.click(
        within(heading).getByRole("button", { name: "Group actions" }),
      );
      await userEvent.click(screen.getByRole("menuitem", { name: /Hide/ }));

      await waitFor(() => {
        expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
      });
      expect(screen.getByText(`${METRIC_NAME} hidden`)).toBeInTheDocument();
    });

    it("shows Remove star after starring a page with the s shortcut", async () => {
      setup({ initialRoute: pageRoute });
      expect(
        await screen.findByRole("button", { name: "Star" }),
      ).toBeInTheDocument();

      fireEvent.keyDown(document.body, { key: "s" });

      expect(
        await screen.findByRole("button", { name: "Remove star" }),
      ).toBeInTheDocument();
      expect(
        writeCalls("express:/api/exploration/page/:id/starred"),
      ).toHaveLength(1);
    });

    it("undoes the optimistic hide and star when the write fails", async () => {
      setup({ initialRoute: pageRoute, writeStatus: 500 });
      expect(
        await screen.findByRole("button", { name: "Star" }),
      ).toBeInTheDocument();

      fireEvent.keyDown(document.body, { key: "s" });
      expect(
        await screen.findByText("Failed to update star"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Star" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Remove star" }),
      ).not.toBeInTheDocument();

      fireEvent.keyDown(document.body, { key: "h" });
      expect(
        await screen.findByText("Failed to update visibility"),
      ).toBeInTheDocument();
      expect(getPageRowNames()).toEqual(["Zebra", "Aardvark"]);
    });
  });
});
