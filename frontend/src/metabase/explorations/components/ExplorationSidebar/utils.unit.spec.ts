import dayjs from "dayjs";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  createBlock,
  createExploration,
  createExplorationDocument,
  createPage,
  createQuery,
  createThread,
} from "metabase/explorations/test-utils";
import type { ExplorationQueryStatus } from "metabase-types/api";
import { createMockComment } from "metabase-types/api/mocks/comment";

import type { ExplorationTreeNode, ExplorationTreePage } from "./utils";
import {
  getCompactRelativeTime,
  getExplorationSidebarTabsInfo,
  getExplorationSidebarTree,
  pickInitialSidebarEntity,
} from "./utils";

const allTreeFilter = getExplorationSidebarTabsInfo().all.treeItemFilter;

function getAllTabExplorationSidebarTree(
  opts: Parameters<typeof createExploration>[0],
) {
  return getExplorationSidebarTree(createExploration(opts), allTreeFilter);
}

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

function getAllPageIds(
  tree: ReturnType<typeof getExplorationSidebarTree>,
): string[] {
  const ids: string[] = [];
  function walk(nodes: ITreeNodeItem<ExplorationTreeNode>[]) {
    for (const node of nodes) {
      if (node.data?.type === "page") {
        ids.push(node.data.page_id);
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  }
  walk(tree);
  return ids;
}

function getFilteredSidebarTree(
  exploration: ReturnType<typeof createExploration>,
  tab: keyof ReturnType<typeof getExplorationSidebarTabsInfo>,
  comments?: Parameters<typeof getExplorationSidebarTabsInfo>[1],
) {
  const tabsInfo = getExplorationSidebarTabsInfo(exploration, comments);
  return getExplorationSidebarTree(exploration, tabsInfo[tab].treeItemFilter);
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

    const tree = getAllTabExplorationSidebarTree({
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
    });

    expect(getLeafIds(getMetricHeadings(tree)[0])).toEqual(["2", "1"]);
  });

  it("orders pages alphabetically by name when sortOrder is alphabetical", () => {
    const banana = createQuery({
      id: 1,
      name: "Banana",
      status: "done",
      interestingness_score: 0.9,
    });
    const apple = createQuery({
      id: 2,
      name: "Apple",
      status: "done",
      interestingness_score: 0.2,
    });

    const tree = getExplorationSidebarTree(
      createExploration({
        queries: [banana, apple],
        blocks: [
          createBlock({
            id: METRIC_A_BLOCK_ID,
            name: "Metric A",
            position: 0,
            pages: [
              createPage({
                id: 1,
                name: "Banana",
                position: 0,
                query_ids: [banana.id],
              }),
              createPage({
                id: 2,
                name: "Apple",
                position: 1,
                query_ids: [apple.id],
              }),
            ],
          }),
        ],
      }),
      allTreeFilter,
      {},
      "alphabetical",
    );

    // "Apple" (id 2) sorts before "Banana" (id 1) despite lower interestingness.
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

    const tree = getAllTabExplorationSidebarTree({
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
    });

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

    const tree = getAllTabExplorationSidebarTree({
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
    });

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

    const tree = getAllTabExplorationSidebarTree({
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
    });

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

    const tree = getAllTabExplorationSidebarTree({
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
    });

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

    const tree = getAllTabExplorationSidebarTree({
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
    });

    const heading = getMetricHeadings(tree)[0];
    expect(heading?.name).toBe("Country");
    expect((heading?.children ?? []).map((child) => child.name)).toEqual([
      "Signups",
      "Revenue",
    ]);
  });
});

describe("getExplorationSidebarTree names follow-up branches with their metric", () => {
  it("prefixes a follow-up thread heading with the metric it drilled into", () => {
    const initialQuery = createQuery({
      id: 1,
      name: "Revenue",
      status: "done",
    });
    const followUpQuery = createQuery({
      id: 2,
      name: "Revenue",
      status: "done",
    });

    const initialThread = createThread({
      id: 1,
      position: 0,
      queries: [initialQuery],
      blocks: [
        createBlock({
          id: 10,
          name: "Revenue",
          position: 0,
          pages: [
            createPage({
              id: 100,
              name: "State",
              position: 0,
              query_ids: [initialQuery.id],
            }),
          ],
        }),
      ],
    });

    // A follow-up drill copies a single metric ("Revenue"); its thread name is
    // just the drill path ("State = TX").
    const followUpThread = createThread({
      id: 2,
      name: "State = TX",
      position: 1,
      queries: [followUpQuery],
      blocks: [
        createBlock({
          id: 20,
          name: "Revenue",
          position: 0,
          pages: [
            createPage({
              id: 200,
              name: "User",
              position: 0,
              query_ids: [followUpQuery.id],
            }),
          ],
        }),
      ],
    });

    const exploration = {
      ...createExploration(),
      threads: [initialThread, followUpThread],
    };

    const tree = getExplorationSidebarTree(exploration, allTreeFilter, {
      "2": "1",
    });

    const followUpNode = tree.find((node) => node.id === 2);
    expect(followUpNode?.name).toBe("Revenue → State = TX");
    // The redundant "Revenue" metric-group row is folded away; its page is
    // surfaced directly under the branch.
    expect((followUpNode?.children ?? []).map((child) => child.name)).toEqual([
      "User",
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

    const tree = getAllTabExplorationSidebarTree({
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
    });

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
    return getAllTabExplorationSidebarTree({
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
    });
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
    return getAllTabExplorationSidebarTree({
      queries: [],
      blocks: [],
      documents: [createExplorationDocument({ id: 99, name: "AI Summary" })],
      ...threadOverrides,
    });
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
    const tree = getAllTabExplorationSidebarTree({
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
    });

    expect(headingData(tree[0])?.lastActivityAt).toBe("2026-04-30T12:00:00Z");
  });

  it("leaves last activity undefined when no query has finished", () => {
    const tree = getAllTabExplorationSidebarTree({
      queries: [createQuery({ id: 1, name: "Q1", status: "pending" })],
    });

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

describe("getExplorationSidebarTabsInfo", () => {
  const BLOCK_ID = 10;
  const STARRED_PAGE_ID = 1;
  const UNSTARRED_PAGE_ID = 2;
  const DISCUSSED_PAGE_ID = 3;

  const starredQuery = createQuery({
    id: 1,
    name: "Starred",
    status: "done",
  });
  const unstarredQuery = createQuery({
    id: 2,
    name: "Unstarred",
    status: "done",
  });
  const discussedQuery = createQuery({
    id: 3,
    name: "Discussed",
    status: "done",
  });

  const mixedPagesExploration = createExploration({
    queries: [starredQuery, unstarredQuery, discussedQuery],
    blocks: [
      createBlock({
        id: BLOCK_ID,
        name: "Revenue",
        position: 0,
        pages: [
          createPage({
            id: STARRED_PAGE_ID,
            name: "Starred",
            position: 0,
            query_ids: [starredQuery.id],
            starred: true,
          }),
          createPage({
            id: UNSTARRED_PAGE_ID,
            name: "Unstarred",
            position: 1,
            query_ids: [unstarredQuery.id],
            starred: false,
          }),
          createPage({
            id: DISCUSSED_PAGE_ID,
            name: "Discussed",
            position: 2,
            query_ids: [discussedQuery.id],
          }),
        ],
      }),
    ],
  });

  describe("stars filter", () => {
    it("includes only pages marked starred on the backend", () => {
      const tree = getFilteredSidebarTree(mixedPagesExploration, "stars");

      expect(getAllPageIds(tree)).toEqual([String(STARRED_PAGE_ID)]);
    });

    it("returns an empty tree when nothing is starred", () => {
      const exploration = createExploration({
        queries: [unstarredQuery],
        blocks: [
          createBlock({
            id: BLOCK_ID,
            name: "Revenue",
            position: 0,
            pages: [
              createPage({
                id: UNSTARRED_PAGE_ID,
                name: "Unstarred",
                position: 0,
                query_ids: [unstarredQuery.id],
                starred: false,
              }),
            ],
          }),
        ],
      });

      expect(getFilteredSidebarTree(exploration, "stars")).toEqual([]);
    });

    it("excludes AI summary documents", () => {
      const exploration = createExploration({
        queries: [starredQuery],
        blocks: [
          createBlock({
            id: BLOCK_ID,
            name: "Revenue",
            position: 0,
            pages: [
              createPage({
                id: STARRED_PAGE_ID,
                name: "Starred",
                position: 0,
                query_ids: [starredQuery.id],
                starred: true,
              }),
            ],
          }),
        ],
        documents: [createExplorationDocument({ id: 99, name: "AI Summary" })],
        thread: { ai_summary_document_id: 99 },
      });

      expect(getFilteredSidebarTree(exploration, "stars")).toEqual([
        expect.objectContaining({
          children: [
            expect.objectContaining({
              id: String(BLOCK_ID),
              children: [
                expect.objectContaining({ id: String(STARRED_PAGE_ID) }),
              ],
            }),
          ],
        }),
      ]);
    });
  });

  describe("discussions filter", () => {
    it("includes only pages referenced by string child_target_id comments", () => {
      const comments = [
        createMockComment({
          target_type: "exploration",
          target_id: mixedPagesExploration.id,
          child_target_id: String(DISCUSSED_PAGE_ID),
        }),
      ];

      const tree = getFilteredSidebarTree(
        mixedPagesExploration,
        "discussions",
        comments,
      );

      expect(getAllPageIds(tree)).toEqual([String(DISCUSSED_PAGE_ID)]);
    });

    it("returns an empty tree when there are no page comments", () => {
      expect(
        getFilteredSidebarTree(mixedPagesExploration, "discussions"),
      ).toEqual([]);
    });
  });
});
