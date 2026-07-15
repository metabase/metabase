import dayjs from "dayjs";
import { c, t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { ExplorationSidebarTab } from "metabase/explorations/types";
import type {
  Comment,
  DocumentId,
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
  getExplorationQueryGroupInterestingness,
  getExplorationQueryGroupStatus,
} from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";
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
  hideable?: boolean;
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

export function isHiddenTreeItem(
  node: ITreeNodeItem<ExplorationTreeNode>,
): boolean {
  return isExplorationTreePage(node) && node.data?.hidden === true;
}

export interface ExplorationTreeDocument {
  type: "document";
  id: DocumentId;
  status: ExplorationQueryStatus;
  parent_id: string | number;
  isAiSummary: boolean;
}

export type ExplorationTreeItem = ExplorationTreePage | ExplorationTreeDocument;

export type ExplorationTreeNode = ExplorationTreeItem | ExplorationTreeHeading;

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
  threads.forEach((thread, index) => {
    const parentThreadId = getParentThreadId(thread);
    const isFollowUp = parentThreadId != null;
    // Only the first sub-exploration off the initial investigation surfaces the
    // metric it drilled into; follow-ups nested inside another sub-exploration
    // don't repeat it ("Revenue → State = TX" once, not on every descendant).
    const isTopLevelFollowUp = isFollowUp && parentThreadId === initialThreadId;
    let children = getExplorationQueryTree(thread, treeItemFilter, sortOrder);
    // A follow-up drill copies a single metric, so its lone metric-group
    // heading ("Revenue") is redundant as a row — surface its pages directly
    // under the thread, and for the first sub-exploration fold the metric's
    // name into the thread heading ("Revenue → State = TX").
    let metricName: string | undefined;
    if (
      isFollowUp &&
      children.length === 1 &&
      children[0].data?.type === "heading"
    ) {
      if (isTopLevelFollowUp) {
        metricName = children[0].name || undefined;
      }
      children = [...(children[0].children ?? [])];
    }
    const aiSummaryDocumentNode = getAISummaryDocumentNode(thread);
    if (
      aiSummaryDocumentNode != null &&
      treeItemFilter(aiSummaryDocumentNode)
    ) {
      children.push(aiSummaryDocumentNode);
    }
    nodeByThreadId.set(thread.id, {
      id: thread.id,
      name: getExplorationThreadName(thread, index, metricName),
      icon: "empty" as const,
      data: {
        type: "heading" as const,
        headingKind:
          index === 0 ? ("root" as const) : ("sub-exploration" as const),
        explorationId: exploration.id,
        thread,
        status: getExplorationQueryGroupStatus(thread.queries ?? []),
        lastActivityAt: latestTimestamp(
          (thread.queries ?? []).map((query) => query.finished_at),
        ),
        // Every group is hideable except the first thread ("Initial investigation").
        hideable: index > 0,
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

  return pruneEmptyHeadings(topLevel, initialThreadId);
}

function pruneEmptyHeadings(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
  initialThreadId: ExplorationThreadId | undefined,
): ITreeNodeItem<ExplorationTreeNode>[] {
  return nodes
    .map((node) =>
      node.children?.length
        ? {
            ...node,
            children: pruneEmptyHeadings(node.children, initialThreadId),
          }
        : node,
    )
    .filter(
      (node) =>
        node.data?.type !== "heading" ||
        node.id === initialThreadId ||
        (node.children?.length ?? 0) > 0,
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
                ? getExplorationQueryGroupInterestingness(queries)
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
        hideable: true,
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

function getAISummaryDocumentNode(
  thread: ExplorationThread,
): ITreeNodeItem<ExplorationTreeDocument> | null {
  const aiSummaryDocument = thread.documents?.find(
    (document) => document.id === thread.ai_summary_document_id,
  );
  if (!aiSummaryDocument) {
    return null;
  }
  return {
    id: aiSummaryDocument.id,
    name: aiSummaryDocument.name,
    icon: "document",
    data: {
      type: "document",
      id: aiSummaryDocument.id,
      status: getExplorationDocumentStatus(aiSummaryDocument.id, thread),
      parent_id: thread.id,
      isAiSummary: true,
    },
  };
}

function getExplorationDocumentStatus(
  documentId: DocumentId,
  thread: ExplorationThread,
) {
  if (documentId !== thread.ai_summary_document_id) {
    return "done";
  }
  if (thread.canceled_at != null) {
    return "canceled";
  }
  if (thread.completed_at != null) {
    return "done";
  }
  return "running";
}

export function getExplorationThreadName(
  thread: ExplorationThread,
  index: number,
  metricName?: string,
) {
  const base =
    thread.name || (index === 0 ? t`Initial investigation` : t`New research`);
  // For a follow-up branch, prefix the metric it drilled into so the row reads
  // "Revenue → State = TX" rather than just the bare drill path.
  if (metricName) {
    return c("{0} is a metric name, {1} is the follow-up's drill path")
      .t`${metricName} → ${base}`;
  }
  return base;
}

export function flattenTree(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
): ITreeNodeItem<ExplorationTreeItem>[] {
  const result: ITreeNodeItem<ExplorationTreeNode>[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children?.length) {
      result.push(...flattenTree(node.children));
    }
  }
  return result.filter(
    (node): node is ITreeNodeItem<ExplorationTreeItem> =>
      node.data?.type === "document" || node.data?.type === "page",
  );
}

export function pickInitialSidebarEntity(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
): SelectedEntityId | null {
  for (const node of nodes) {
    if (node.data?.type === "page") {
      return { type: "page", id: node.data.page_id };
    }
    if (node.children?.length) {
      const result = pickInitialSidebarEntity(node.children);
      if (result != null) {
        return result;
      }
    }
  }
  return null;
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
