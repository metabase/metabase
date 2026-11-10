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
// the star and hide writes, so render only the real toolbar in its place.
jest.mock("../components/ExplorationVisualization", () => ({
  ExplorationGroupVisualization: (props: GroupVisualizationProps) => (
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
  ),
  ExplorationChartAreaSkeleton: () => null,
}));

const EXPLORATION_ID = 1;
const METRIC_NAME = "Count of orders";

function makeExploration(): Exploration {
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
          createPage({ id: 1, name: "Zebra", position: 0, query_ids: [1] }),
          createPage({ id: 2, name: "Aardvark", position: 1, query_ids: [2] }),
        ],
      }),
    ],
    thread: { status: "completed", completed_at: "2026-04-30T00:01:00Z" },
  });
}

interface SetupOpts {
  writeStatus?: number;
}

function setup({ writeStatus = 204 }: SetupOpts = {}) {
  fetchMock.get(`path:/api/exploration/${EXPLORATION_ID}`, makeExploration());
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

  renderWithProviders(
    <Route
      path={`/${Urls.EXPLORATION_BASE_PATH}/:id/page?/:pageId?`}
      element={<ExplorationPage />}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: `${Urls.exploration(EXPLORATION_ID)}/page/1`,
    },
  );
}

function getPageRowNames() {
  return screen
    .getAllByRole("treeitem")
    .map((row) => row.textContent?.trim() ?? "");
}

function writeCalls(url: string) {
  return fetchMock.callHistory.calls(url, { method: "PUT" });
}

describe("ExplorationPage optimistic updates", () => {
  it("removes a page hidden with the h shortcut from the sidebar tree", async () => {
    setup();
    await waitFor(() => {
      expect(getPageRowNames()).toEqual(["Zebra", "Aardvark"]);
    });

    fireEvent.keyDown(document.body, { key: "h" });

    await waitFor(() => {
      expect(getPageRowNames()).toEqual(["Aardvark"]);
    });
    expect(writeCalls("path:/api/exploration/pages/hidden")).toHaveLength(1);
  });

  it("removes every page of a group hidden from its menu from the sidebar tree", async () => {
    setup();
    await waitFor(() => {
      expect(getPageRowNames()).toEqual(["Zebra", "Aardvark"]);
    });

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
    setup();
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
    setup({ writeStatus: 500 });
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
