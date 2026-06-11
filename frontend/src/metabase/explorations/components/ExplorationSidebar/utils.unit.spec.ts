import dayjs from "dayjs";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  createExploration,
  createExplorationDocument,
  createQuery,
  leafGroup,
  metricGroup,
} from "metabase/explorations/test-utils";
import type { ExplorationQueryStatus } from "metabase-types/api";

import type { ExplorationTreeNode, ExplorationTreeQueryGroup } from "./utils";
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
    .filter((child) => child.data?.type === "group")
    .map((child) => String(child.id));
}

function getLeafGroupData(
  heading: ITreeNodeItem<ExplorationTreeNode> | undefined,
  leafId: string,
): ExplorationTreeQueryGroup | undefined {
  const leaf = heading?.children?.find((child) => child.id === leafId);
  return leaf?.data?.type === "group" ? leaf.data : undefined;
}

describe("getExplorationSidebarTree sorting", () => {
  const METRIC_A = "metric:a";
  const METRIC_B = "metric:b";

  it("orders done leaf groups by interestingness descending", () => {
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
        groups: [
          metricGroup(METRIC_A, "Metric A", 0),
          leafGroup("leaf:low", METRIC_A, [low.id], 0),
          leafGroup("leaf:high", METRIC_A, [high.id], 1),
        ],
      }),
    );

    expect(getLeafIds(getMetricHeadings(tree)[0])).toEqual([
      "leaf:high",
      "leaf:low",
    ]);
  });

  it("prefers settled groups over running page groups even when one sibling query already scored highly", () => {
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
        groups: [
          metricGroup(METRIC_A, "Metric A", 0),
          leafGroup(
            "leaf:page",
            METRIC_A,
            [doneSegment.id, pendingSegment.id],
            0,
            "Revenue by region",
            "page",
          ),
          leafGroup("leaf:done", METRIC_A, [doneSingleton.id], 1),
        ],
      }),
    );

    const heading = getMetricHeadings(tree)[0];

    expect(getLeafIds(heading)).toEqual(["leaf:done", "leaf:page"]);
    expect(getLeafGroupData(heading, "leaf:page")).toMatchObject({
      status: "running",
      interestingness_score: null,
    });
    expect(getLeafGroupData(heading, "leaf:done")).toMatchObject({
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
        groups: [
          metricGroup(METRIC_A, "Metric A", 0),
          leafGroup("leaf:error", METRIC_A, [error.id], 0),
          leafGroup("leaf:running", METRIC_A, [running.id], 1),
          leafGroup("leaf:done", METRIC_A, [done.id], 2),
        ],
      }),
    );

    expect(getLeafIds(getMetricHeadings(tree)[0])).toEqual([
      "leaf:done",
      "leaf:running",
      "leaf:error",
    ]);
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
        groups: [
          metricGroup(METRIC_B, "Metric B", 0),
          leafGroup("leaf:b", METRIC_B, [metricBLeaf.id], 0),
          metricGroup(METRIC_A, "Metric A", 1),
          leafGroup("leaf:a", METRIC_A, [metricALeaf.id], 0),
        ],
      }),
    );

    expect(getMetricHeadings(tree).map((heading) => heading.id)).toEqual([
      METRIC_A,
      METRIC_B,
    ]);
  });

  it("tiebreaks equal scores by group id", () => {
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
        groups: [
          metricGroup(METRIC_A, "Metric A", 0),
          leafGroup("leaf:z", METRIC_A, [first.id], 0),
          leafGroup("leaf:a", METRIC_A, [second.id], 1),
        ],
      }),
    );

    expect(getLeafIds(getMetricHeadings(tree)[0])).toEqual([
      "leaf:a",
      "leaf:z",
    ]);
  });
});

describe("getExplorationSidebarTree passes BE-computed names through", () => {
  const DIM_GROUP = "dim:country";

  it("uses the group's group_name for the heading and each leaf's name for sub-items", () => {
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
        groups: [
          metricGroup(DIM_GROUP, "Country", 0, "By Country"),
          leafGroup("auto:country:10", DIM_GROUP, [signups.id], 0, "Signups"),
          leafGroup("auto:country:11", DIM_GROUP, [revenue.id], 1, "Revenue"),
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
  const METRIC_A = "metric:a";

  it("picks a fully settled group over a page group still waiting on a sibling query", () => {
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
        groups: [
          metricGroup(METRIC_A, "Metric A", 0),
          leafGroup(
            "leaf:page",
            METRIC_A,
            [doneSegment.id, pendingSegment.id],
            0,
            "Revenue by region",
            "page",
          ),
          leafGroup("leaf:done", METRIC_A, [doneSingleton.id], 1),
        ],
      }),
    );

    expect(pickInitialSidebarEntity(tree)).toEqual({
      type: "group",
      id: "leaf:done",
    });
  });
});

describe("getExplorationSidebarTree inherits a heading status from its leaves", () => {
  const METRIC = "metric:revenue";

  function buildTree(statuses: ExplorationQueryStatus[]) {
    const queries = statuses.map((status, i) =>
      createQuery({ id: i + 1, name: `Q${i + 1}`, status }),
    );
    return getExplorationSidebarTree(
      createExploration({
        queries,
        groups: [
          metricGroup(METRIC, "Revenue", 0),
          ...queries.map((q, i) =>
            leafGroup(`leaf:${q.id}`, METRIC, [q.id], i, q.name ?? ""),
          ),
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

  it("is running while any leaf query is still loading", () => {
    const tree = buildTree(["pending", "done"]);
    expect(headingStatus(tree)).toBe("running");
    expect(threadStatus(tree)).toBe("running");
  });

  it("is error once all leaves are settled and one or more errored", () => {
    const tree = buildTree(["done", "error"]);
    expect(headingStatus(tree)).toBe("error");
    expect(threadStatus(tree)).toBe("error");
  });

  it("is done when all leaf queries are done", () => {
    const tree = buildTree(["done", "done"]);
    expect(headingStatus(tree)).toBe("done");
    expect(threadStatus(tree)).toBe("done");
  });
});

describe("getExplorationSidebarTree Findings heading status", () => {
  function findingsStatus(tree: ReturnType<typeof getExplorationSidebarTree>) {
    const node = tree.find((n) => n.id === "documents");
    return node?.data?.type === "heading" ? node.data.status : undefined;
  }

  function buildTree(threadOverrides: Parameters<typeof createExploration>[0]) {
    return getExplorationSidebarTree(
      createExploration({
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
    expect(findingsStatus(tree)).toBe("running");
  });

  it("is done once the AI summary document has finished", () => {
    const tree = buildTree({
      thread: {
        ai_summary_document_id: 99,
        completed_at: "2026-04-30T00:01:00Z",
        canceled_at: null,
      },
    });
    expect(findingsStatus(tree)).toBe("done");
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

  it("derives the Findings heading's last activity from the newest document updated_at", () => {
    const tree = getExplorationSidebarTree(
      createExploration({
        documents: [
          createExplorationDocument({
            id: 1,
            name: "Scratchpad",
            updated_at: "2026-04-29T08:00:00Z",
          }),
          createExplorationDocument({
            id: 2,
            name: "AI Summary",
            updated_at: "2026-05-01T09:00:00Z",
          }),
        ],
      }),
    );

    const findings = tree.find((node) => node.id === "documents");
    expect(headingData(findings)?.lastActivityAt).toBe("2026-05-01T09:00:00Z");
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
