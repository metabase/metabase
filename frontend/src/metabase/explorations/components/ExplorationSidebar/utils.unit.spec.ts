import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  createExploration,
  createQuery,
  leafGroup,
  metricGroup,
} from "metabase/explorations/test-utils";

import type { ExplorationTreeNode, ExplorationTreeQueryGroup } from "./utils";
import { getExplorationSidebarTree, pickInitialSidebarEntity } from "./utils";

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
