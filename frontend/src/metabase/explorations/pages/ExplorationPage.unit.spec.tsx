import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";
import { useReducer } from "react";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import {
  createBlock,
  createExploration,
  createPage,
  createQuery,
  createThread,
} from "metabase/explorations/test-utils";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Exploration, ExplorationThread } from "metabase-types/api";

import { ExplorationPage } from "./ExplorationPage";

const RERENDER_BUTTON_TESTID = "exploration-rerender-trigger";

// Re-renders are driven from inside the router tree (not RTL's `rerender`), so the
// v3 `<Router>` never receives new `routes`/`children` and stops warning about it.
function ExplorationPageHarness() {
  const [, forceRerender] = useReducer((tick: number) => tick + 1, 0);
  return (
    <>
      <button data-testid={RERENDER_BUTTON_TESTID} onClick={forceRerender} />
      <ExplorationPage />
    </>
  );
}

let explorationData: Exploration;
const sendToastMock = jest.fn();

jest.mock("metabase/common/hooks", () => ({
  ...jest.requireActual("metabase/common/hooks"),
  useToast: () => [sendToastMock],
}));

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
  ExplorationGroupVisualization: () => <div data-testid="group-viz" />,
  ExplorationChartAreaSkeleton: () => null,
}));

type CapturedSidebarNavProps = {
  onPreviousPage: () => void;
  onNextPage: () => void;
};

let latestSidebarNavProps: CapturedSidebarNavProps | null = null;

jest.mock("../components/ExplorationSidebar", () => ({
  ExplorationSidebar: (props: CapturedSidebarNavProps) => {
    latestSidebarNavProps = {
      onPreviousPage: props.onPreviousPage,
      onNextPage: props.onNextPage,
    };
    return <div data-testid="sidebar" />;
  },
  ExplorationTitle: () => <div data-testid="exploration-title" />,
}));

function makeThread(
  id: number,
  name: string | null,
  pages: ReturnType<typeof createPage>[],
  queries: ReturnType<typeof createQuery>[],
): ExplorationThread {
  return createThread({
    id,
    name,
    blocks: [
      createBlock({
        id: id * 10,
        name: name ?? "Untitled block",
        pages,
      }),
    ],
    queries,
  });
}

function makeExploration(threads: ExplorationThread[]): Exploration {
  return {
    ...createExploration(),
    threads,
  };
}

function getThreads(exploration: Exploration): ExplorationThread[] {
  return exploration.threads ?? [];
}

function renderExplorationPage(initialRoute?: string) {
  const path = Urls.exploration(explorationData.id);
  return renderWithProviders(
    <Route
      path={`/${Urls.EXPLORATION_BASE_PATH}/:id/page?/:pageId?`}
      element={<ExplorationPageHarness />}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: initialRoute ?? `${path}/page/100?timeline=1&foo=bar`,
    },
  );
}

function rerenderExplorationPage() {
  fireEvent.click(screen.getByTestId(RERENDER_BUTTON_TESTID));
}

function makeMultiPageExploration(): Exploration {
  return makeExploration([
    makeThread(
      1,
      "Initial thread",
      [
        createPage({
          id: 100,
          name: "Page A",
          position: 0,
          query_ids: [1],
        }),
        createPage({
          id: 200,
          name: "Page B",
          position: 1,
          query_ids: [2],
        }),
        createPage({
          id: 300,
          name: "Page C",
          position: 2,
          query_ids: [3],
        }),
      ],
      [
        createQuery({ id: 1, name: "Query A", status: "done" }),
        createQuery({ id: 2, name: "Query B", status: "done" }),
        createQuery({ id: 3, name: "Query C", status: "done" }),
      ],
    ),
  ]);
}

describe("ExplorationPage page navigation", () => {
  beforeEach(() => {
    latestSidebarNavProps = null;
    explorationData = makeMultiPageExploration();
    // goToAdjacentPage prefetches the following page's query results
    fetchMock.get("express:/api/exploration/query/:id", {
      data: { rows: [], cols: [] },
    });
  });

  it("onNextPage navigates to the next page id in sidebar order", async () => {
    const { router } = renderExplorationPage(
      `${Urls.exploration(explorationData.id)}/page/100`,
    );
    if (!router) {
      throw new Error("expected router");
    }
    expect(latestSidebarNavProps).not.toBeNull();

    await act(async () => {
      latestSidebarNavProps?.onNextPage();
    });

    await waitFor(() => {
      expect(router.location.pathname).toContain("/page/200");
    });
  });

  it("onNextPage prefetches the page after the destination", async () => {
    renderExplorationPage(`${Urls.exploration(explorationData.id)}/page/100`);

    await act(async () => {
      latestSidebarNavProps?.onNextPage();
    });

    // A → B; prefetch the page after B (C / query 3), not B itself.
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/exploration/query/3"),
      ).toBe(true);
    });
    expect(fetchMock.callHistory.called("path:/api/exploration/query/2")).toBe(
      false,
    );
  });

  it("onPreviousPage navigates to the previous page id in sidebar order", async () => {
    const { router } = renderExplorationPage(
      `${Urls.exploration(explorationData.id)}/page/200`,
    );
    if (!router) {
      throw new Error("expected router");
    }

    await act(async () => {
      latestSidebarNavProps?.onPreviousPage();
    });

    await waitFor(() => {
      expect(router.location.pathname).toContain("/page/100");
    });
  });

  it("onNextPage wraps from the last page to the first", async () => {
    const { router } = renderExplorationPage(
      `${Urls.exploration(explorationData.id)}/page/300`,
    );
    if (!router) {
      throw new Error("expected router");
    }

    await act(async () => {
      latestSidebarNavProps?.onNextPage();
    });

    await waitFor(() => {
      expect(router.location.pathname).toContain("/page/100");
    });
  });

  it("onPreviousPage wraps from the first page to the last", async () => {
    const { router } = renderExplorationPage(
      `${Urls.exploration(explorationData.id)}/page/100`,
    );
    if (!router) {
      throw new Error("expected router");
    }

    await act(async () => {
      latestSidebarNavProps?.onPreviousPage();
    });

    await waitFor(() => {
      expect(router.location.pathname).toContain("/page/300");
    });
  });
});

describe("ExplorationPage thread-ready toasts", () => {
  beforeEach(() => {
    sendToastMock.mockClear();
    latestSidebarNavProps = null;
    explorationData = makeExploration([
      makeThread(
        1,
        "Initial thread",
        [
          createPage({
            id: 100,
            name: "Initial page",
            query_ids: [1],
          }),
        ],
        [createQuery({ id: 1, name: "Initial query", status: "done" })],
      ),
    ]);
  });

  it("does not toast for threads that were present on the initial load", async () => {
    renderExplorationPage();

    expect(screen.getByTestId("group-viz")).toBeInTheDocument();
    expect(sendToastMock).not.toHaveBeenCalled();
  });

  it("waits for the first page with queries before toasting about a new thread", async () => {
    renderExplorationPage();

    // Thread arrives while query planning is still running — no pages yet.
    explorationData = makeExploration([
      getThreads(explorationData)[0],
      createThread({
        id: 2,
        name: "Revenue deep dive",
        blocks: [],
        queries: [],
      }),
    ]);
    rerenderExplorationPage();
    expect(sendToastMock).not.toHaveBeenCalled();

    // A page can land before it has queries. The sidebar hides pages without
    // queries, so the toast must wait for the same readiness condition.
    explorationData = makeExploration([
      getThreads(explorationData)[0],
      makeThread(
        2,
        "Revenue deep dive",
        [
          createPage({
            id: 200,
            name: "Follow-up page",
            query_ids: [],
          }),
        ],
        [],
      ),
    ]);
    rerenderExplorationPage();
    expect(sendToastMock).not.toHaveBeenCalled();

    explorationData = makeExploration([
      getThreads(explorationData)[0],
      makeThread(
        2,
        "Revenue deep dive",
        [
          createPage({
            id: 200,
            name: "Follow-up page",
            query_ids: [2],
          }),
        ],
        [createQuery({ id: 2, name: "Follow-up query", status: "done" })],
      ),
    ]);
    rerenderExplorationPage();

    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Added Revenue deep dive",
        actionLabel: "View",
      }),
    );
  });

  it("does not duplicate the toast on repeated polls", async () => {
    renderExplorationPage();

    const threadReadyExploration = makeExploration([
      getThreads(explorationData)[0],
      makeThread(
        2,
        "Second thread",
        [
          createPage({
            id: 200,
            name: "Second page",
            query_ids: [2],
          }),
        ],
        [createQuery({ id: 2, name: "Second query", status: "done" })],
      ),
    ]);

    explorationData = threadReadyExploration;
    rerenderExplorationPage();
    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Added Second thread" }),
    );

    explorationData = threadReadyExploration;
    rerenderExplorationPage();
    expect(
      sendToastMock.mock.calls.filter(
        (call) => call[0]?.message === "Added Second thread",
      ),
    ).toHaveLength(1);
  });

  it("navigates to the new page with tab=all and preserves unrelated query params when View is clicked", async () => {
    const { router } = renderExplorationPage();
    if (!router) {
      throw new Error("expected router");
    }

    explorationData = makeExploration([
      getThreads(explorationData)[0],
      makeThread(
        2,
        "Second thread",
        [
          createPage({
            id: 200,
            name: "Second page",
            query_ids: [2],
          }),
        ],
        [createQuery({ id: 2, name: "Second query", status: "done" })],
      ),
    ]);
    rerenderExplorationPage();

    const toastCall = sendToastMock.mock.calls.find(
      (call) => call[0]?.actionLabel === "View",
    );
    expect(toastCall?.[0]?.action).toEqual(expect.any(Function));

    await act(async () => {
      toastCall?.[0]?.action?.();
    });

    await waitFor(() => {
      expect(router.location.pathname).toContain("/page/200");
      expect(
        Object.fromEntries(new URLSearchParams(router.location.search)),
      ).toMatchObject({
        tab: "all",
        timeline: "1",
        foo: "bar",
      });
    });
  });

  it("does not toast about existing threads when navigating to a different exploration", async () => {
    const { router } = renderExplorationPage();
    if (!router) {
      throw new Error("expected router");
    }
    expect(sendToastMock).not.toHaveBeenCalled();

    // Another exploration whose named thread already has a ready page. Without
    // remounting on `:id` change, the previous exploration's seen-thread set
    // would treat it as newly added and toast about it.
    explorationData = {
      ...makeExploration([
        makeThread(
          7,
          "Other exploration thread",
          [
            createPage({
              id: 700,
              name: "Other page",
              query_ids: [7],
            }),
          ],
          [createQuery({ id: 7, name: "Other query", status: "done" })],
        ),
      ]),
      id: 2,
    };
    act(() => {
      router.navigate("/question/research/2/page/700");
    });

    expect(screen.getByTestId("group-viz")).toBeInTheDocument();
    expect(sendToastMock).not.toHaveBeenCalled();
  });

  it("toasts once for each newly ready named thread", async () => {
    renderExplorationPage();

    explorationData = makeExploration([
      getThreads(explorationData)[0],
      makeThread(
        2,
        "Thread A",
        [
          createPage({
            id: 200,
            name: "Thread A page",
            query_ids: [2],
          }),
        ],
        [createQuery({ id: 2, name: "Thread A query", status: "done" })],
      ),
    ]);
    rerenderExplorationPage();
    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Added Thread A" }),
    );

    explorationData = makeExploration([
      ...getThreads(explorationData),
      makeThread(
        3,
        "Thread B",
        [
          createPage({
            id: 300,
            name: "Thread B page",
            query_ids: [3],
          }),
        ],
        [createQuery({ id: 3, name: "Thread B query", status: "done" })],
      ),
    ]);
    rerenderExplorationPage();

    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Added Thread B" }),
    );
    expect(
      sendToastMock.mock.calls.filter(
        (call) => call[0]?.message === "Added Thread A",
      ),
    ).toHaveLength(1);
  });
});
