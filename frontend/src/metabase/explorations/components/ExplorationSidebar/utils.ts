import dayjs from "dayjs";
import { t } from "ttag";

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
} from "metabase-types/api";
import {
  getExplorationQueryGroupInterestingness,
  getExplorationQueryGroupStatus,
} from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";

export interface ExplorationTreeHeading {
  type: "heading";
  explorationId?: ExplorationId;
  thread?: ExplorationThread;
  status?: ExplorationQueryStatus;
  lastActivityAt?: string;
}

export interface ExplorationTreePage {
  type: "page";
  page_id: ExplorationPageNodeId;
  query_ids: ExplorationQueryId[];
  queries: ExplorationQuery[];
  status: ExplorationQueryStatus;
  interestingness_score: number | null;
  parent_id: ExplorationPageNodeId | null;
}

function isExplorationTreePage(
  node: ITreeNodeItem<ExplorationTreeNode>,
): node is ITreeNodeItem<ExplorationTreePage> {
  return node.data?.type === "page";
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

export function getExplorationSidebarTree(
  exploration: Exploration,
  treeItemFilter: TreeItemFilter,
): ITreeNodeItem<ExplorationTreeNode>[] {
  const tree: ITreeNodeItem<ExplorationTreeNode>[] = (exploration.threads ?? [])
    .map((thread, index) => {
      const children = getExplorationQueryTree(thread, treeItemFilter);
      const aiSummaryDocumentNode = getAISummaryDocumentNode(thread);
      if (
        aiSummaryDocumentNode != null &&
        treeItemFilter(aiSummaryDocumentNode)
      ) {
        children.push(aiSummaryDocumentNode);
      }
      return {
        id: thread.id,
        name: getExplorationThreadName(thread, index),
        icon: "empty" as const,
        data: {
          type: "heading" as const,
          explorationId: exploration.id,
          thread,
          status: getExplorationQueryGroupStatus(thread.queries ?? []),
          lastActivityAt: latestTimestamp(
            (thread.queries ?? []).map((query) => query.finished_at),
          ),
        },
        children,
      };
    })
    .filter((heading) => (heading.children ?? []).length > 0);
  return tree;
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
        status: getExplorationQueryGroupStatus(
          children.flatMap((child) =>
            isExplorationTreePage(child) ? (child.data?.queries ?? []) : [],
          ),
        ),
      },
      children,
    };
  });

  return headings
    .filter((heading) => (heading.children ?? []).length > 0)
    .map((heading) => ({
      ...heading,
      children: heading.children?.toSorted(compareExplorationTreePages),
    }))
    .toSorted(compareExplorationTreeHeadings);
}

function compareExplorationTreePages(
  a: ITreeNodeItem<ExplorationTreeNode>,
  b: ITreeNodeItem<ExplorationTreeNode>,
) {
  if (
    !a.data ||
    !b.data ||
    !isExplorationTreePage(a) ||
    !isExplorationTreePage(b)
  ) {
    return 0;
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
) {
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

function getExplorationThreadName(thread: ExplorationThread, index: number) {
  if (thread.name) {
    return thread.name;
  }
  if (index === 0) {
    return t`Initial investigation`;
  }
  return t`New research`;
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
  const pages =
    exploration?.threads?.flatMap(
      (thread) => thread.blocks?.flatMap((block) => block.pages) ?? [],
    ) ?? [];
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
