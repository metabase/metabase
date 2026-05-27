import { c, t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type {
  DocumentId,
  Exploration,
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
} from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";

export interface ExplorationTreeHeading {
  type: "heading";
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
      },
      children: getExplorationQueryTree(thread),
    };
  });
  tree.push({
    id: "documents",
    name: t`Findings`,
    icon: "empty",
    data: {
      type: "heading",
    },
    children: getExplorationDocumentTree(exploration),
  });
  return tree;
}

function getExplorationQueryTree(
  thread: ExplorationThread,
): ITreeNodeItem<ExplorationTreeNode>[] {
  const groups = (thread.groups ?? []).filter(
    (group): group is ExplorationQueryGroup & { name: string } =>
      group.name != null, // don't show anything missing a name
  );

  const headings: ITreeNodeItem<ExplorationTreeNode>[] = [];
  const headingsById = new Map<
    ExplorationQueryGroupId,
    ITreeNodeItem<ExplorationTreeNode>
  >();

  // first pass - get the headings
  for (const group of groups) {
    if (group.parent_group_id != null) {
      continue;
    }
    const heading: ITreeNodeItem<ExplorationTreeNode> = {
      id: group.id,
      name: group.name,
      icon: "empty",
      data: {
        type: "heading",
      },
      children: [],
    };
    headings.push(heading);
    headingsById.set(group.id, heading);
  }

  const queriesById = new Map<ExplorationQueryId, ExplorationQuery>(
    (thread.queries ?? []).map((query) => [query.id, query]),
  );

  // second pass - assign queries to headings
  for (const group of groups) {
    if (group.parent_group_id == null) {
      continue;
    }
    const heading = headingsById.get(group.parent_group_id);
    if (heading && heading.children) {
      const groupQueries = group.query_ids
        .map((id) => queriesById.get(id))
        .filter((q) => q != null);
      if (groupQueries.length > 0) {
        const dimensionName = groupQueries[0].dimension_name;
        const status = getExplorationQueryGroupStatus(groupQueries);
        heading.children.push({
          id: group.id,
          name: c("${0} indicates the chart's dimension")
            .t`By ${dimensionName}`,
          icon: "lineandbar",
          data: {
            type: "group",
            group_id: group.id,
            query_ids: group.query_ids,
            queries: groupQueries,
            status,
            interestingness_score:
              status === "done"
                ? getExplorationQueryGroupInterestingness(groupQueries)
                : null,
            parent_id: group.parent_group_id,
          },
        });
      }
    }
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
          status:
            document.id === thread.ai_summary_document_id &&
            thread.started_at != null &&
            thread.completed_at == null
              ? "running"
              : "done",
          parent_id: "documents",
        },
      };
    });
  });
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
