import { act } from "@testing-library/react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
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

jest.mock("../components/ExplorationSidebar", () => ({
  ExplorationSidebar: () => <div data-testid="sidebar" />,
  ExplorationTitle: () => <div data-testid="exploration-title" />,
}));

jest.mock("../components/ExplorationDocument", () => ({
  ExplorationDocument: () => null,
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
      path={`${Urls.exploration(explorationData.id)}(/:entityType/:entityId)`}
      component={ExplorationPage}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: initialRoute ?? `${path}/page/100?timeline=1&foo=bar`,
    },
  );
}

function rerenderExplorationPage(
  rerender: ReturnType<typeof renderWithProviders>["rerender"],
) {
  rerender(
    <Route
      path={`${Urls.exploration(explorationData.id)}(/:entityType/:entityId)`}
      component={ExplorationPage}
    />,
  );
}

describe("ExplorationPage thread-ready toasts", () => {
  beforeEach(() => {
    sendToastMock.mockClear();
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

  it("waits for the first page before toasting about a new thread", async () => {
    const { rerender } = renderExplorationPage();

    explorationData = makeExploration([
      getThreads(explorationData)[0],
      createThread({
        id: 2,
        name: "Revenue deep dive",
        blocks: [],
        queries: [],
      }),
    ]);
    rerenderExplorationPage(rerender);
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
    rerenderExplorationPage(rerender);

    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Added Revenue deep dive",
        actionLabel: "View",
      }),
    );
  });

  it("does not duplicate the toast on repeated polls", async () => {
    const { rerender } = renderExplorationPage();

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
    rerenderExplorationPage(rerender);
    expect(sendToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Added Second thread" }),
    );

    explorationData = threadReadyExploration;
    rerenderExplorationPage(rerender);
    expect(
      sendToastMock.mock.calls.filter(
        (call) => call[0]?.message === "Added Second thread",
      ),
    ).toHaveLength(1);
  });

  it("navigates to the new page with tab=all and preserves unrelated query params when View is clicked", async () => {
    const { rerender, history } = renderExplorationPage();
    if (!history) {
      throw new Error("expected router history");
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
    rerenderExplorationPage(rerender);

    const toastCall = sendToastMock.mock.calls.find(
      (call) => call[0]?.actionLabel === "View",
    );
    expect(toastCall?.[0]?.action).toEqual(expect.any(Function));

    await act(async () => {
      toastCall?.[0]?.action?.();
    });

    await waitFor(() => {
      expect(history.getCurrentLocation().pathname).toContain("/page/200");
      expect(history.getCurrentLocation().query).toMatchObject({
        tab: "all",
        timeline: "1",
        foo: "bar",
      });
    });
  });

  it("toasts once for each newly ready named thread", async () => {
    const { rerender } = renderExplorationPage();

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
    rerenderExplorationPage(rerender);
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
    rerenderExplorationPage(rerender);

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
