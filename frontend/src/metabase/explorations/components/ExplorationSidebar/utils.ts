import dayjs from "dayjs";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { ExplorationSidebarTab } from "metabase/explorations/types";
import type {
  Comment,
  Exploration,
  ExplorationId,
  ExplorationPageNodeId,
  ExplorationQuery,
  ExplorationQueryId,
  ExplorationQueryStatus,
  ExplorationThread,
  ExplorationThreadId,
} from "metabase-types/api";
import {
  getExplorationPages,
  getExplorationQueryGroupStatus,
  isTerminalExplorationThreadStatus,
} from "metabase-types/api";

import {
  DEFAULT_SORT_ORDER,
  type ExplorationSortOrder,
} from "../../sidebar-preferences";

// Distinguishes the kinds of heading rows in the sidebar so each can carry its
// own icon and reinforce where the user is in the investigation:
//   - "root": the initial investigation thread (the origin of everything)
//   - "sub-exploration": a follow-up research thread
//   - "metric-group": a block of pages for one metric within a thread
export type ExplorationHeadingKind =
  | "root"
  | "sub-exploration"
  | "metric-group";

export interface ExplorationTreeHeading {
  type: "heading";
  headingKind: ExplorationHeadingKind;
  explorationId?: ExplorationId;
  thread?: ExplorationThread;
  status?: ExplorationQueryStatus;
  lastActivityAt?: string;
  pageIds?: number[];
  allHidden?: boolean;
}

export interface ExplorationTreePage {
  type: "page";
  page_id: ExplorationPageNodeId;
  query_ids: ExplorationQueryId[];
  queries: ExplorationQuery[];
  status: ExplorationQueryStatus;
  interestingness_score: number | null;
  parent_id: ExplorationPageNodeId | null;
  hidden: boolean;
}

function isExplorationTreePage(
  node: ITreeNodeItem<ExplorationTreeNode>,
): node is ITreeNodeItem<ExplorationTreePage> {
  return node.data?.type === "page";
}

/**
 * Sidebar-heading status for a thread. The server-derived thread status is authoritative for
 * terminal state (so a finished thread never shimmers as "running", even with zero queries);
 * while the thread is still running we fall back to the per-query group status so the heading
 * tracks the queries streaming in.
 */
function threadHeadingStatus(
  thread: ExplorationThread,
): ExplorationQueryStatus {
  return match(thread.status)
    .with("failed", () => "error" as const)
    .with("canceled", () => "canceled" as const)
    .with("completed", "empty", "forbidden", () => "done" as const)
    .with("pending", "running", () =>
      getExplorationQueryGroupStatus(thread.queries ?? []),
    )
    .exhaustive();
}

export function isHiddenTreeItem(
  node: ITreeNodeItem<ExplorationTreeNode>,
): boolean {
  return isExplorationTreePage(node) && node.data?.hidden === true;
}

export type ExplorationTreeNode = ExplorationTreePage | ExplorationTreeHeading;

type TreeItemFilter = (treeItem: ITreeNodeItem<ExplorationTreeNode>) => boolean;

function collectHeadingPages(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
): ExplorationTreePage[] {
  return flattenTree(nodes).flatMap((node) =>
    node.data?.type === "page" ? [node.data] : [],
  );
}

function getHeadingHideState(nodes: ITreeNodeItem<ExplorationTreeNode>[]): {
  pageIds: number[];
  allHidden: boolean;
} {
  const pages = collectHeadingPages(nodes);
  return {
    pageIds: pages.map((page) => Number(page.page_id)),
    allHidden: pages.length > 0 && pages.every((page) => page.hidden),
  };
}

export function getExplorationSidebarTree(
  exploration: Exploration,
  treeItemFilter: TreeItemFilter,
  sortOrder: ExplorationSortOrder = DEFAULT_SORT_ORDER,
): ITreeNodeItem<ExplorationTreeNode>[] {
  const threads = exploration.threads ?? [];
  const initialThreadId = threads[0]?.id;
  const pageThreadIds = new Map<number, ExplorationThreadId>();
  for (const thread of threads) {
    for (const block of thread.blocks ?? []) {
      for (const page of block.pages) {
        pageThreadIds.set(page.id, thread.id);
      }
    }
  }
  const getParentThreadId = (
    thread: ExplorationThread,
  ): ExplorationThreadId | undefined =>
    thread.source_page_id != null
      ? pageThreadIds.get(thread.source_page_id)
      : undefined;

  const nodeByThreadId = new Map<
    ExplorationThreadId,
    ITreeNodeItem<ExplorationTreeNode>
  >();

  // use the initial thread's interestingness scores to sort all threads
  // that means each thread has a consistent order
  // plus we don't have to run the expensive contextual interestingness for each thread
  const interestingnessByPageKey = getInterestingnessByPageKey(
    threads[0]?.queries ?? [],
  );

  threads.forEach((thread, index) => {
    const parentThreadId = getParentThreadId(thread);
    const isFollowUp = parentThreadId != null;
    let children = getExplorationQueryTree(
      thread,
      treeItemFilter,
      sortOrder,
      interestingnessByPageKey,
    );
    // A follow-up drill copies a single metric, so its lone metric-group
    // heading is redundant as a row — surface its pages directly under the thread.
    if (
      isFollowUp &&
      children.length === 1 &&
      children[0].data?.type === "heading"
    ) {
      children = [...(children[0].children ?? [])];
    }
    nodeByThreadId.set(thread.id, {
      id: thread.id,
      name: getExplorationThreadName(thread, index),
      icon: "empty" as const,
      data: {
        type: "heading" as const,
        headingKind:
          index === 0 ? ("root" as const) : ("sub-exploration" as const),
        explorationId: exploration.id,
        thread,
        status: threadHeadingStatus(thread),
        lastActivityAt: latestTimestamp(
          (thread.queries ?? []).map((query) => query.finished_at),
        ),
        ...getHeadingHideState(children),
      },
      children,
    });
  });

  // Drills off the initial investigation stay top-level; deeper drills nest
  // under the thread that owns their source page.
  const getNestingParentId = (
    thread: ExplorationThread,
  ): ExplorationThreadId | null => {
    const parentId = getParentThreadId(thread);
    return parentId == null || parentId === initialThreadId ? null : parentId;
  };

  const topLevel: ITreeNodeItem<ExplorationTreeNode>[] = [];
  threads.forEach((thread) => {
    const node = nodeByThreadId.get(thread.id);
    if (node == null) {
      return;
    }
    const parentId = getNestingParentId(thread);
    const parentNode = parentId != null ? nodeByThreadId.get(parentId) : null;
    if (parentNode != null && parentNode !== node) {
      // Sub-explorations appear after the parent thread's own charts.
      parentNode.children = [...(parentNode.children ?? []), node];
    } else {
      topLevel.push(node);
    }
  });

  return pruneEmptyHeadings(topLevel);
}

type PageKey = string;

// every query in a page has the same card_id, dimension_id, and query_type
// we use this to identify the same shaped pages across threads
function getPageKey(query: ExplorationQuery): PageKey {
  const { card_id, dimension_id, query_type } = query;
  return `${card_id}-${dimension_id}-${query_type}`;
}

// max interestingness (contextual preferred) across all queries in a page
function getInterestingnessByPageKey(
  queries: ExplorationQuery[],
): Record<PageKey, number | null> {
  const interestingnessByPageKey: Record<PageKey, number | null> = {};
  for (const q of queries) {
    const key = getPageKey(q);
    const score =
      q.contextual_interestingness_score ?? q.interestingness_score ?? null;
    const existingScore = interestingnessByPageKey[key];
    if (score != null && (existingScore == null || score > existingScore)) {
      interestingnessByPageKey[key] = score;
    }
  }
  return interestingnessByPageKey;
}

function pruneEmptyHeadings(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
): ITreeNodeItem<ExplorationTreeNode>[] {
  return nodes
    .map((node) =>
      node.children?.length
        ? {
            ...node,
            children: pruneEmptyHeadings(node.children),
          }
        : node,
    )
    .filter(
      (node) =>
        node.data?.type !== "heading" || (node.children?.length ?? 0) > 0,
    );
}

function latestTimestamp(
  values: (string | null | undefined)[],
): string | undefined {
  let latest: string | undefined;
  for (const value of values) {
    if (value != null && (latest == null || value > latest)) {
      latest = value;
    }
  }
  return latest;
}

/** Compact "time ago" for sidebar headings: `now`, `5m`, `3h`, `2d`, `4w`, `6mo`, `1y`. */
export function getCompactRelativeTime(timestamp: string): string {
  const now = dayjs();
  const then = dayjs(timestamp);
  const minutes = now.diff(then, "minute");
  if (minutes < 1) {
    return t`now`;
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = now.diff(then, "hour");
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = now.diff(then, "day");
  if (days < 7) {
    return `${days}d`;
  }
  const weeks = now.diff(then, "week");
  if (weeks < 4) {
    return `${weeks}w`;
  }
  const months = now.diff(then, "month");
  if (months < 12) {
    return `${months}mo`;
  }
  return `${now.diff(then, "year")}y`;
}

function getExplorationQueryTree(
  thread: ExplorationThread,
  treeItemFilter: TreeItemFilter,
  sortOrder: ExplorationSortOrder,
  interestingnessByPageKey: Record<PageKey, number | null>,
): ITreeNodeItem<ExplorationTreeNode>[] {
  const queriesById = new Map<ExplorationQueryId, ExplorationQuery>(
    (thread.queries ?? []).map((query) => [query.id, query]),
  );

  const blocks = (thread.blocks ?? []).filter(
    (block) => block.name != null, // don't show anything missing a name
  );

  const headings: ITreeNodeItem<ExplorationTreeNode>[] = blocks.map((block) => {
    const children: ITreeNodeItem<ExplorationTreeNode>[] = block.pages
      .map((page): ITreeNodeItem<ExplorationTreeNode> | null => {
        const queries = page.query_ids
          .map((id) => queriesById.get(id))
          .filter((q): q is ExplorationQuery => q != null);
        if (queries.length === 0) {
          return null;
        }
        const status = getExplorationQueryGroupStatus(queries);
        const pageKey = getPageKey(queries[0]);
        return {
          id: String(page.id),
          name: page.name ?? "",
          icon: "lineandbar",
          data: {
            type: "page",
            page_id: String(page.id),
            query_ids: page.query_ids,
            queries,
            status,
            interestingness_score:
              status === "done"
                ? (interestingnessByPageKey[pageKey] ?? null)
                : null,
            parent_id: String(block.id),
            hidden: page.hidden ?? false,
          },
        };
      })
      .filter(
        (node): node is ITreeNodeItem<ExplorationTreeNode> =>
          node != null && treeItemFilter(node),
      );

    return {
      id: String(block.id),
      name: block.name ?? "",
      icon: "empty",
      data: {
        type: "heading",
        headingKind: "metric-group",
        status: getExplorationQueryGroupStatus(
          children.flatMap((child) =>
            isExplorationTreePage(child) ? (child.data?.queries ?? []) : [],
          ),
        ),
        ...getHeadingHideState(children),
      },
      children,
    };
  });

  return headings
    .filter((heading) => (heading.children ?? []).length > 0)
    .map((heading) => ({
      ...heading,
      children: heading.children?.toSorted((a, b) =>
        compareExplorationTreePages(a, b, sortOrder),
      ),
    }))
    .toSorted((a, b) => compareExplorationTreeHeadings(a, b, sortOrder));
}

function compareByName(
  a: ITreeNodeItem<ExplorationTreeNode>,
  b: ITreeNodeItem<ExplorationTreeNode>,
) {
  const diff = a.name.localeCompare(b.name);
  if (diff === 0) {
    // sort by id as a fallback to keep sort stable
    return String(a.id).localeCompare(String(b.id));
  }
  return diff;
}

function compareExplorationTreePages(
  a: ITreeNodeItem<ExplorationTreeNode>,
  b: ITreeNodeItem<ExplorationTreeNode>,
  sortOrder: ExplorationSortOrder,
) {
  if (
    !a.data ||
    !b.data ||
    !isExplorationTreePage(a) ||
    !isExplorationTreePage(b)
  ) {
    return 0;
  }
  if (sortOrder === "alphabetical") {
    return compareByName(a, b);
  }
  const getScore = (page: ExplorationTreePage) => {
    if (page.status === "error") {
      return -2;
    }
    if (page.status === "running") {
      return -1;
    }
    return page.interestingness_score ?? 0;
  };
  const diff = getScore(b.data) - getScore(a.data);
  if (diff === 0) {
    // sort by id as a fallback to keep sort stable
    return String(a.id).localeCompare(String(b.id));
  }
  return diff;
}

function compareExplorationTreeHeadings(
  a: ITreeNodeItem<ExplorationTreeNode>,
  b: ITreeNodeItem<ExplorationTreeNode>,
  sortOrder: ExplorationSortOrder,
) {
  if (sortOrder === "alphabetical") {
    return compareByName(a, b);
  }
  const getScore = (heading: ITreeNodeItem<ExplorationTreeNode>) => {
    let max = 0;
    for (const child of heading.children ?? []) {
      if (isExplorationTreePage(child)) {
        max = Math.max(max, child.data?.interestingness_score ?? 0);
      }
    }
    return max;
  };
  const diff = getScore(b) - getScore(a);
  if (diff === 0) {
    // sort by id as a fallback to keep sort stable
    return String(a.id).localeCompare(String(b.id));
  }
  return diff;
}

export function getExplorationThreadName(
  thread: ExplorationThread,
  index: number,
) {
  return (
    thread.name || (index === 0 ? t`Initial investigation` : t`New research`)
  );
}

export function flattenTree(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
): ITreeNodeItem<ExplorationTreePage>[] {
  const result: ITreeNodeItem<ExplorationTreeNode>[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children?.length) {
      result.push(...flattenTree(node.children));
    }
  }
  return result.filter(
    (node): node is ITreeNodeItem<ExplorationTreePage> =>
      node.data?.type === "page",
  );
}

export function pickInitialSidebarPage(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
): ExplorationPageNodeId | null {
  for (const node of nodes) {
    if (node.data?.type === "page") {
      return node.data.page_id;
    }
    if (node.children?.length) {
      const result = pickInitialSidebarPage(node.children);
      if (result != null) {
        return result;
      }
    }
  }
  return null;
}

export function treeHasPages(
  tree: ITreeNodeItem<ExplorationTreeNode>[],
): boolean {
  return flattenTree(tree).some((node) => node.data?.type === "page");
}

export type ExplorationSidebarContentMode =
  | "loading"
  | "forbidden"
  | "all-hidden"
  | "empty"
  | "tree";

export interface ExplorationSidebarModel {
  tree: ITreeNodeItem<ExplorationTreeNode>[];
  contentMode: ExplorationSidebarContentMode;
}

export function getExplorationSidebarModel({
  exploration,
  selectedSidebarTab,
  tabsInfo,
  showHidden,
  sortOrder = DEFAULT_SORT_ORDER,
}: {
  exploration: Exploration;
  selectedSidebarTab: ExplorationSidebarTab;
  tabsInfo: ExplorationSidebarTabsInfo;
  showHidden: boolean;
  sortOrder?: ExplorationSortOrder;
}): ExplorationSidebarModel {
  const tabFilter = tabsInfo[selectedSidebarTab].treeItemFilter;
  const treeItemFilter = showHidden
    ? tabFilter
    : (node: ITreeNodeItem<ExplorationTreeNode>) =>
        tabFilter(node) && !isHiddenTreeItem(node);

  const tree = getExplorationSidebarTree(
    exploration,
    treeItemFilter,
    sortOrder,
  );
  const treeWithHidden = getExplorationSidebarTree(
    exploration,
    tabFilter,
    sortOrder,
  );

  const hasPages = treeHasPages(tree);
  const initialThread = exploration.threads?.[0];

  let contentMode: ExplorationSidebarContentMode;
  if (
    selectedSidebarTab === "all" &&
    initialThread != null &&
    !isTerminalExplorationThreadStatus(initialThread.status) &&
    !hasPages
  ) {
    contentMode = "loading";
  } else if (
    !hasPages &&
    (exploration.threads ?? []).some((thread) => thread.status === "forbidden")
  ) {
    contentMode = "forbidden";
  } else if (!showHidden && tree.length === 0 && treeWithHidden.length > 0) {
    contentMode = "all-hidden";
  } else if (tree.length === 0) {
    contentMode = "empty";
  } else {
    contentMode = "tree";
  }

  return { tree, contentMode };
}

export type ExplorationSidebarTabsInfo = Record<
  ExplorationSidebarTab,
  {
    value: ExplorationSidebarTab;
    label: string;
    treeItemFilter: TreeItemFilter;
    emptyTreeMessage: string;
  }
>;

export function getExplorationSidebarTabsInfo(
  exploration?: Exploration,
  comments?: Comment[],
): ExplorationSidebarTabsInfo {
  const pages = exploration ? getExplorationPages(exploration) : [];
  const starredPageIds = new Set(
    pages.filter((page) => page.starred).map((page) => String(page.id)),
  );
  const discussionPageIds = new Set(
    comments
      ?.map((comment) => comment.child_target_id)
      .filter((pageId) => typeof pageId === "string"),
  );
  return {
    all: {
      value: "all",
      label: t`All`,
      treeItemFilter: () => true,
      emptyTreeMessage: t`Nothing to see here yet.`,
    },
    stars: {
      value: "stars",
      label: t`Stars`,
      treeItemFilter: (node) =>
        isExplorationTreePage(node) &&
        node.data?.page_id != null &&
        starredPageIds.has(node.data.page_id),
      emptyTreeMessage: t`Nothing's been starred yet.`,
    },
    discussions: {
      value: "discussions",
      label: t`Discussions`,
      treeItemFilter: (node) =>
        isExplorationTreePage(node) &&
        node.data?.page_id != null &&
        discussionPageIds.has(node.data.page_id),
      emptyTreeMessage: t`No discussions yet.`,
    },
  };
}
