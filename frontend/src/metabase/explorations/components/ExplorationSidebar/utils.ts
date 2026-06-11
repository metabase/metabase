import dayjs from "dayjs";
import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type {
  DocumentId,
  Exploration,
  ExplorationId,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationQueryGroupId,
  ExplorationQueryId,
  ExplorationQueryStatus,
  ExplorationThread,
} from "metabase-types/api";
import {
  getExplorationQueryGroupInterestingness,
  getExplorationQueryGroupStatus,
  isSettledExplorationQueryStatus,
} from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";

export interface ExplorationTreeHeading {
  type: "heading";
  explorationId?: ExplorationId;
  thread?: ExplorationThread;
  status?: ExplorationQueryStatus;
  lastActivityAt?: string;
}

export interface ExplorationTreeQueryGroup {
  type: "group";
  group_id: ExplorationQueryGroupId;
  query_ids: ExplorationQueryId[];
  queries: ExplorationQuery[];
  status: ExplorationQueryStatus;
  interestingness_score: number | null;
  parent_id: ExplorationQueryGroupId | null;
}

function isExplorationTreeQueryGroup(
  node: ITreeNodeItem<ExplorationTreeNode>,
): node is ITreeNodeItem<ExplorationTreeQueryGroup> {
  return node.data?.type === "group";
}

export interface ExplorationTreeDocument {
  type: "document";
  id: DocumentId;
  status: ExplorationQueryStatus;
  parent_id: string;
  isAiSummary: boolean;
}

export type ExplorationTreeItem =
  | ExplorationTreeQueryGroup
  | ExplorationTreeDocument;

export type ExplorationTreeNode = ExplorationTreeItem | ExplorationTreeHeading;

export function getExplorationSidebarTree(
  exploration: Exploration,
): ITreeNodeItem<ExplorationTreeNode>[] {
  const tree: ITreeNodeItem<ExplorationTreeNode>[] = (
    exploration.threads ?? []
  ).map((thread, index) => {
    return {
      id: thread.id,
      name: getExplorationThreadName(thread, index),
      icon: "empty",
      data: {
        type: "heading",
        explorationId: exploration.id,
        thread,
        status: getExplorationQueryGroupStatus(thread.queries ?? []),
        lastActivityAt: latestTimestamp(
          (thread.queries ?? []).map((query) => query.finished_at),
        ),
      },
      children: getExplorationQueryTree(thread),
    };
  });
  const documentNodes = getExplorationDocumentTree(exploration);
  tree.push({
    id: "documents",
    name: t`Findings`,
    icon: "empty",
    data: {
      type: "heading",
      status: getDocumentsHeadingStatus(documentNodes),
      lastActivityAt: latestTimestamp(
        (exploration.threads ?? []).flatMap((thread) =>
          (thread.documents ?? []).map((document) => document.updated_at),
        ),
      ),
    },
    children: documentNodes,
  });
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

function getDocumentsHeadingStatus(
  documents: ITreeNodeItem<ExplorationTreeDocument>[],
): ExplorationQueryStatus | undefined {
  const statuses = documents
    .map((doc) => doc.data?.status)
    .filter((status): status is ExplorationQueryStatus => status != null);
  if (statuses.length === 0) {
    return undefined;
  }
  if (statuses.some((status) => !isSettledExplorationQueryStatus(status))) {
    return "running";
  }
  if (statuses.some((status) => status === "canceled")) {
    return "canceled";
  }
  return "done";
}

function getExplorationQueryTree(
  thread: ExplorationThread,
): ITreeNodeItem<ExplorationTreeNode>[] {
  const groups = (thread.groups ?? []).filter(
    (group): group is ExplorationQueryGroup & { name: string } =>
      group.name != null, // don't show anything missing a name
  );

  const queriesById = new Map<ExplorationQueryId, ExplorationQuery>(
    (thread.queries ?? []).map((query) => [query.id, query]),
  );

  const leafGroupsByParent = new Map<
    ExplorationQueryGroupId,
    { group: ExplorationQueryGroup; queries: ExplorationQuery[] }[]
  >();
  for (const group of groups) {
    if (group.parent_group_id == null) {
      continue;
    }
    const queries = group.query_ids
      .map((id) => queriesById.get(id))
      .filter((q): q is ExplorationQuery => q != null);
    if (queries.length === 0) {
      continue;
    }
    const siblings = leafGroupsByParent.get(group.parent_group_id) ?? [];
    siblings.push({ group, queries });
    leafGroupsByParent.set(group.parent_group_id, siblings);
  }

  const headings: ITreeNodeItem<ExplorationTreeNode>[] = [];

  for (const group of groups) {
    if (group.parent_group_id != null) {
      continue;
    }
    const leafGroups = leafGroupsByParent.get(group.id) ?? [];

    const children: ITreeNodeItem<ExplorationTreeNode>[] = leafGroups.map(
      ({ group: leafGroup, queries }) => {
        const status = getExplorationQueryGroupStatus(queries);
        return {
          id: leafGroup.id,
          name: leafGroup.name ?? "",
          icon: "lineandbar",
          data: {
            type: "group",
            group_id: leafGroup.id,
            query_ids: leafGroup.query_ids,
            queries,
            status,
            interestingness_score:
              status === "done"
                ? getExplorationQueryGroupInterestingness(queries)
                : null,
            parent_id: leafGroup.parent_group_id,
          },
        };
      },
    );

    headings.push({
      id: group.id,
      name: group.group_name ?? group.name,
      icon: "empty",
      data: {
        type: "heading",
        status: getExplorationQueryGroupStatus(
          leafGroups.flatMap((leaf) => leaf.queries),
        ),
      },
      children,
    });
  }

  return headings
    .filter((heading) => (heading.children ?? []).length > 0)
    .map((heading) => ({
      ...heading,
      children: heading.children?.toSorted(compareExplorationTreeQueryGroups),
    }))
    .toSorted(compareExplorationTreeHeadings);
}

function compareExplorationTreeQueryGroups(
  a: ITreeNodeItem<ExplorationTreeNode>,
  b: ITreeNodeItem<ExplorationTreeNode>,
) {
  if (
    !a.data ||
    !b.data ||
    !isExplorationTreeQueryGroup(a) ||
    !isExplorationTreeQueryGroup(b)
  ) {
    return 0;
  }
  const getScore = (group: ExplorationTreeQueryGroup) => {
    if (group.status === "error") {
      return -2;
    }
    if (group.status === "running") {
      return -1;
    }
    return group.interestingness_score ?? 0;
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
      if (isExplorationTreeQueryGroup(child)) {
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

function getExplorationDocumentTree(
  exploration: Exploration,
): ITreeNodeItem<ExplorationTreeDocument>[] {
  return (exploration.threads ?? []).flatMap((thread) => {
    const aiSummaryId = thread.ai_summary_document_id;
    // sort the documents so the AI Summary document is first within each thread
    const documents = [...(thread.documents ?? [])].sort((a, b) => {
      if (aiSummaryId == null) {
        return 0;
      }
      const aIsAuto = a.id === aiSummaryId;
      const bIsAuto = b.id === aiSummaryId;
      if (aIsAuto === bIsAuto) {
        return 0;
      }
      return aIsAuto ? -1 : 1;
    });
    return documents.map((document) => {
      return {
        id: document.id,
        name: document.name,
        icon: "document",
        data: {
          type: "document",
          id: document.id,
          status: getExplorationDocumentStatus(document.id, thread),
          parent_id: "documents",
          isAiSummary: document.id === aiSummaryId,
        },
      };
    });
  });
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
      node.data?.type === "document" || node.data?.type === "group",
  );
}

export function pickInitialSidebarEntity(
  nodes: ITreeNodeItem<ExplorationTreeNode>[],
): SelectedEntityId | null {
  for (const node of nodes) {
    if (node.data?.type === "group") {
      return { type: "group", id: node.data.group_id };
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
