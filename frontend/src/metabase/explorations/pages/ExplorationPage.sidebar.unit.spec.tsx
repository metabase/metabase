import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
import {
  createBlock,
  createExploration,
  createPage,
  createQuery,
} from "metabase/explorations/test-utils";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Exploration } from "metabase-types/api";

import { ExplorationPage } from "./ExplorationPage";

let explorationData: Exploration;

jest.mock("metabase/api", () => {
  const actual = jest.requireActual("metabase/api");
  return {
    ...actual,
    useGetExplorationQuery: () => ({
      data: explorationData,
      isLoading: false,
      error: undefined,
    }),
    useListCommentsQuery: () => ({ data: { comments: [] } }),
    useListTimelinesQuery: () => ({ data: [] }),
  };
});

jest.mock("../components/ExplorationVisualization", () => ({
  ExplorationGroupVisualization: ({ page }: { page: { id: number } }) => (
    <div data-testid="group-viz">{`Chart for page ${page.id}`}</div>
  ),
  ExplorationChartAreaSkeleton: () => null,
}));

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
}

function setup({
  exploration = makeExploration(),
  initialRoute,
}: SetupOpts = {}) {
  explorationData = exploration;
  fetchMock.get("express:/api/exploration/query/:id", {
    data: { rows: [], cols: [] },
  });
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [],
    tables: [],
    fields: [],
  });

  const { router, unmount } = renderWithProviders(
    <Route
      path={`/${Urls.EXPLORATION_BASE_PATH}/:id/page?/:pageId?`}
      element={<ExplorationPage />}
    />,
    {
      withRouter: true,
      initialRoute: initialRoute ?? Urls.exploration(exploration.id),
    },
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

function filterToggle() {
  return screen.getByTestId("exploration-show-hidden-toggle");
}

describe("ExplorationPage sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("selects a clicked page, shows its chart, and keeps the timeline param", async () => {
    const { router } = setup({
      initialRoute: `${Urls.exploration(1)}/page/1?timeline=7`,
    });

    expect(getPageRow("Zebra")).toHaveAttribute("aria-selected", "true");
    expect(getPageRow("Aardvark")).toHaveAttribute("aria-selected", "false");

    await userEvent.click(getPageRow("Aardvark"));

    expect(getPageRow("Aardvark")).toHaveAttribute("aria-selected", "true");
    expect(getPageRow("Zebra")).toHaveAttribute("aria-selected", "false");
    expect(router.location.pathname).toBe(`${Urls.exploration(1)}/page/2`);
    expect(new URLSearchParams(router.location.search).get("timeline")).toBe(
      "7",
    );
    expect(screen.getByTestId("group-viz")).toHaveTextContent(
      "Chart for page 2",
    );
  });

  it("switches to the Stars and Discussions tabs through the URL and shows their empty messages", async () => {
    const { router } = setup();

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

    expect(getPageRowNames()).toEqual(["Zebra", "Aardvark"]);

    await userEvent.click(filterToggle());
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Alphabetical/ }),
    );

    expect(getPageRowNames()).toEqual(["Aardvark", "Zebra"]);
    expect(filterToggle()).toHaveAttribute("aria-pressed", "false");

    unmount();
    setup();

    expect(getPageRowNames()).toEqual(["Aardvark", "Zebra"]);
    expect(filterToggle()).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(filterToggle());
    expect(
      await screen.findByRole("menuitem", { name: /Alphabetical/ }),
    ).toHaveAttribute("data-checked", "true");
  });

  it("reveals hidden pages with a Hidden marker from the Show hidden items toggle", async () => {
    setup({ exploration: makeExploration({ hiddenPageIds: [1] }) });

    expect(getPageRowNames()).toEqual(["Aardvark"]);
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
});
