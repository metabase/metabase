import dayjs from "dayjs";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  createBlock,
  createExploration,
  createExplorationDocument,
  createPage,
  createQuery,
} from "metabase/explorations/test-utils";
import type { ExplorationQueryStatus } from "metabase-types/api";

import type { ExplorationTreeNode, ExplorationTreePage } from "./utils";
import {
  getCompactRelativeTime,
  getExplorationSidebarTree,
  pickInitialSidebarEntity,
} from "./utils";

function getMetricHeadings(tree: ReturnType<typeof getExplorationSidebarTree>) {
  return tree[0]?.children ?? [];
}

function getLeafIds(
  heading: ITreeNodeItem<ExplorationTreeNode> | undefined,
): string[] {
  return (heading?.children ?? [])
    .filter((child) => child.data?.type === "page")
    .map((child) => String(child.id));
}

function getPageData(
  heading: ITreeNodeItem<ExplorationTreeNode> | undefined,
  pageId: string,
): ExplorationTreePage | undefined {
  const leaf = heading?.children?.find((child) => child.id === pageId);
  return leaf?.data?.type === "page" ? leaf.data : undefined;
}

describe("getExplorationSidebarTree sorting", () => {
  const METRIC_A_BLOCK_ID = 10;
  const METRIC_B_BLOCK_ID = 20;

  it("orders done pages by interestingness descending", () => {
    const low = createQuery({
      id: 1,
      name: "Low",
      status: "done",
      interestingness_score: 0.2,
    });
    const high = createQuery({
      id: 2,
      name: "High",
      status: "done",
      interestingness_score: 0.9,
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [low, high],
        blocks: [
          createBlock({
            id: METRIC_A_BLOCK_ID,
            name: "Metric A",
            position: 0,
            pages: [
              createPage({
                id: 1,
                name: "Low",
                position: 0,
                query_ids: [low.id],
              }),
              createPage({
                id: 2,
                name: "High",
                position: 1,
                query_ids: [high.id],
              }),
            ],
          }),
        ],
      }),
    );

    expect(getLeafIds(getMetricHeadings(tree)[0])).toEqual(["2", "1"]);
  });

  it("prefers settled pages over running pages even when one sibling query already scored highly", () => {
    const doneSegment = createQuery({
      id: 1,
      name: "Revenue (US)",
      status: "done",
      interestingness_score: 0.99,
    });
    const pendingSegment = createQuery({
      id: 2,
      name: "Revenue (EU)",
      status: "pending",
    });
    const doneSingleton = createQuery({
      id: 3,
      name: "Done but less interesting",
      status: "done",
      interestingness_score: 0.2,
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [doneSegment, pendingSegment, doneSingleton],
        blocks: [
          createBlock({
            id: METRIC_A_BLOCK_ID,
            name: "Metric A",
            position: 0,
            pages: [
              createPage({
                id: 100,
                name: "Revenue by region",
                position: 0,
                query_ids: [doneSegment.id, pendingSegment.id],
              }),
              createPage({
                id: 3,
                name: "Done but less interesting",
                position: 1,
                query_ids: [doneSingleton.id],
              }),
            ],
          }),
        ],
      }),
    );

    const heading = getMetricHeadings(tree)[0];

    expect(getLeafIds(heading)).toEqual(["3", "100"]);
    expect(getPageData(heading, "100")).toMatchObject({
      status: "running",
      interestingness_score: null,
    });
    expect(getPageData(heading, "3")).toMatchObject({
      status: "done",
      interestingness_score: 0.2,
    });
  });

  it("orders siblings done, then running, then error", () => {
    const done = createQuery({ id: 1, name: "Done", status: "done" });
    const running = createQuery({ id: 2, name: "Running", status: "pending" });
    const error = createQuery({
      id: 3,
      name: "Error",
      status: "error",
      error_message: "boom",
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [error, running, done],
        blocks: [
          createBlock({
            id: METRIC_A_BLOCK_ID,
            name: "Metric A",
            position: 0,
            pages: [
              createPage({
                id: 3,
                name: "Error",
                position: 0,
                query_ids: [error.id],
              }),
              createPage({
                id: 2,
                name: "Running",
                position: 1,
                query_ids: [running.id],
              }),
              createPage({
                id: 1,
                name: "Done",
                position: 2,
                query_ids: [done.id],
              }),
            ],
          }),
        ],
      }),
    );

    expect(getLeafIds(getMetricHeadings(tree)[0])).toEqual(["1", "2", "3"]);
  });

  it("orders metric headings by their best settled child score", () => {
    const metricALeaf = createQuery({
      id: 1,
      name: "Metric A leaf",
      status: "done",
      interestingness_score: 0.9,
    });
    const metricBLeaf = createQuery({
      id: 2,
      name: "Metric B leaf",
      status: "done",
      interestingness_score: 0.3,
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [metricBLeaf, metricALeaf],
        blocks: [
          createBlock({
            id: METRIC_B_BLOCK_ID,
            name: "Metric B",
            position: 0,
            pages: [
              createPage({
                id: 2,
                name: "Metric B leaf",
                position: 0,
                query_ids: [metricBLeaf.id],
              }),
            ],
          }),
          createBlock({
            id: METRIC_A_BLOCK_ID,
            name: "Metric A",
            position: 1,
            pages: [
              createPage({
                id: 1,
                name: "Metric A leaf",
                position: 0,
                query_ids: [metricALeaf.id],
              }),
            ],
          }),
        ],
      }),
    );

    expect(getMetricHeadings(tree).map((heading) => heading.id)).toEqual([
      String(METRIC_A_BLOCK_ID),
      String(METRIC_B_BLOCK_ID),
    ]);
  });

  it("tiebreaks equal scores by page id", () => {
    const first = createQuery({
      id: 1,
      name: "First",
      status: "done",
      interestingness_score: 0.5,
    });
    const second = createQuery({
      id: 2,
      name: "Second",
      status: "done",
      interestingness_score: 0.5,
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [first, second],
        blocks: [
          createBlock({
            id: METRIC_A_BLOCK_ID,
            name: "Metric A",
            position: 0,
            pages: [
              createPage({
                id: 2,
                name: "First",
                position: 0,
                query_ids: [first.id],
              }),
              createPage({
                id: 1,
                name: "Second",
                position: 1,
                query_ids: [second.id],
              }),
            ],
          }),
        ],
      }),
    );

    expect(getLeafIds(getMetricHeadings(tree)[0])).toEqual(["1", "2"]);
  });
});

describe("getExplorationSidebarTree passes BE-computed names through", () => {
  const DIM_BLOCK_ID = 30;

  it("uses the block's name for the heading and each page's name for sub-items", () => {
    const signups = createQuery({
      id: 1,
      name: "Signups",
      status: "done",
      interestingness_score: 0.9,
    });
    const revenue = createQuery({
      id: 2,
      name: "Revenue",
      status: "done",
      interestingness_score: 0.8,
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [signups, revenue],
        blocks: [
          createBlock({
            id: DIM_BLOCK_ID,
            type: "dimension",
            name: "By Country",
            position: 0,
            pages: [
              createPage({
                id: 10,
                name: "Signups",
                position: 0,
                query_ids: [signups.id],
              }),
              createPage({
                id: 11,
                name: "Revenue",
                position: 1,
                query_ids: [revenue.id],
              }),
            ],
          }),
        ],
      }),
    );

    const heading = getMetricHeadings(tree)[0];
    expect(heading?.name).toBe("By Country");
    expect((heading?.children ?? []).map((child) => child.name)).toEqual([
      "Signups",
      "Revenue",
    ]);
  });
});

describe("pickInitialSidebarEntity", () => {
  const METRIC_A_BLOCK_ID = 10;

  it("picks a fully settled page over a page still waiting on a sibling query", () => {
    const doneSegment = createQuery({
      id: 1,
      name: "Revenue (US)",
      status: "done",
      interestingness_score: 0.99,
    });
    const pendingSegment = createQuery({
      id: 2,
      name: "Revenue (EU)",
      status: "pending",
    });
    const doneSingleton = createQuery({
      id: 3,
      name: "Done but less interesting",
      status: "done",
      interestingness_score: 0.2,
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [doneSegment, pendingSegment, doneSingleton],
        blocks: [
          createBlock({
            id: METRIC_A_BLOCK_ID,
            name: "Metric A",
            position: 0,
            pages: [
              createPage({
                id: 100,
                name: "Revenue by region",
                position: 0,
                query_ids: [doneSegment.id, pendingSegment.id],
              }),
              createPage({
                id: 3,
                name: "Done but less interesting",
                position: 1,
                query_ids: [doneSingleton.id],
              }),
            ],
          }),
        ],
      }),
    );

    expect(pickInitialSidebarEntity(tree)).toEqual({
      type: "page",
      id: "3",
    });
  });
});

describe("getExplorationSidebarTree inherits a heading status from its pages", () => {
  const METRIC_BLOCK_ID = 10;

  function buildTree(statuses: ExplorationQueryStatus[]) {
    const queries = statuses.map((status, i) =>
      createQuery({ id: i + 1, name: `Q${i + 1}`, status }),
    );
    return getExplorationSidebarTree(
      createExploration({
        queries,
        blocks: [
          createBlock({
            id: METRIC_BLOCK_ID,
            name: "Revenue",
            position: 0,
            pages: queries.map((q, i) =>
              createPage({
                id: q.id,
                name: q.name ?? "",
                position: i,
                query_ids: [q.id],
              }),
            ),
          }),
        ],
      }),
    );
  }

  function statusOf(node: ITreeNodeItem<ExplorationTreeNode> | undefined) {
    return node?.data?.type === "heading" ? node.data.status : undefined;
  }

  const threadStatus = (tree: ReturnType<typeof buildTree>) =>
    statusOf(tree[0]);
  const headingStatus = (tree: ReturnType<typeof buildTree>) =>
    statusOf(getMetricHeadings(tree)[0]);

  it("is running while any page query is still loading", () => {
    const tree = buildTree(["pending", "done"]);
    expect(headingStatus(tree)).toBe("running");
    expect(threadStatus(tree)).toBe("running");
  });

  it("is error once all pages are settled and one or more errored", () => {
    const tree = buildTree(["done", "error"]);
    expect(headingStatus(tree)).toBe("error");
    expect(threadStatus(tree)).toBe("error");
  });

  it("is done when all page queries are done", () => {
    const tree = buildTree(["done", "done"]);
    expect(headingStatus(tree)).toBe("done");
    expect(threadStatus(tree)).toBe("done");
  });
});

describe("getExplorationSidebarTree AI summary document status", () => {
  function aiSummaryDocumentStatus(
    tree: ReturnType<typeof getExplorationSidebarTree>,
  ) {
    const doc = tree[0]?.children?.find(
      (node) => node.data?.type === "document" && node.data.isAiSummary,
    );
    return doc?.data?.type === "document" ? doc.data.status : undefined;
  }

  function buildTree(threadOverrides: Parameters<typeof createExploration>[0]) {
    return getExplorationSidebarTree(
      createExploration({
        queries: [],
        blocks: [],
        documents: [createExplorationDocument({ id: 99, name: "AI Summary" })],
        ...threadOverrides,
      }),
    );
  }

  it("is running while the AI summary document is generating", () => {
    const tree = buildTree({
      thread: {
        ai_summary_document_id: 99,
        completed_at: null,
        canceled_at: null,
      },
    });
    expect(aiSummaryDocumentStatus(tree)).toBe("running");
  });

  it("is done once the AI summary document has finished", () => {
    const tree = buildTree({
      thread: {
        ai_summary_document_id: 99,
        completed_at: "2026-04-30T00:01:00Z",
        canceled_at: null,
      },
    });
    expect(aiSummaryDocumentStatus(tree)).toBe("done");
  });
});

describe("getExplorationSidebarTree last-activity timestamps", () => {
  function headingData(node: ITreeNodeItem<ExplorationTreeNode> | undefined) {
    return node?.data?.type === "heading" ? node.data : undefined;
  }

  it("derives the thread heading's last activity from the newest query finished_at", () => {
    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [
          createQuery({
            id: 1,
            name: "Q1",
            status: "done",
            finished_at: "2026-04-28T10:00:00Z",
          }),
          createQuery({
            id: 2,
            name: "Q2",
            status: "done",
            finished_at: "2026-04-30T12:00:00Z",
          }),
          createQuery({ id: 3, name: "Q3", status: "pending" }),
        ],
      }),
    );

    expect(headingData(tree[0])?.lastActivityAt).toBe("2026-04-30T12:00:00Z");
  });

  it("leaves last activity undefined when no query has finished", () => {
    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [createQuery({ id: 1, name: "Q1", status: "pending" })],
      }),
    );

    expect(headingData(tree[0])?.lastActivityAt).toBeUndefined();
  });
});

describe("getCompactRelativeTime", () => {
  it("formats recent timestamps compactly", () => {
    expect(getCompactRelativeTime(dayjs().toISOString())).toBe("now");
    expect(
      getCompactRelativeTime(dayjs().subtract(2, "minute").toISOString()),
    ).toBe("2m");
    expect(
      getCompactRelativeTime(dayjs().subtract(5, "hour").toISOString()),
    ).toBe("5h");
    expect(
      getCompactRelativeTime(dayjs().subtract(3, "day").toISOString()),
    ).toBe("3d");
    expect(
      getCompactRelativeTime(dayjs().subtract(2, "week").toISOString()),
    ).toBe("2w");
    expect(
      getCompactRelativeTime(dayjs().subtract(3, "month").toISOString()),
    ).toBe("3mo");
    expect(
      getCompactRelativeTime(dayjs().subtract(2, "year").toISOString()),
    ).toBe("2y");
  });
});
