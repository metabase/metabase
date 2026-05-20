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
  getExplorationQueryGroupContextualInterestingness,
  getExplorationQueryGroupInterestingness,
  getExplorationQueryGroupStatus,
} from "metabase-types/api";

export interface ExplorationTreeHeading {
  type: "heading";
}

export interface ExplorationTreeQueryGroup {
  type: "group";
  group_id: ExplorationQueryGroupId;
  query_ids: ExplorationQueryId[];
  queries: ExplorationQuery[];
  status: ExplorationQueryStatus;
  /**
   * Interestingness score that drives the "potentially interesting" marker.
   * Holds the prompt-relative `contextual_interestingness_score` when the
   * thread was created with LLM context, otherwise the generic
   * `interestingness_score`. The choice is made once per thread (see
   * `usesContextualInterestingness`) and applied to every group in it.
   */
  interestingness_score: number | null;
  parent_id: ExplorationQueryGroupId | null;
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

/**
 * Whether a thread was created with LLM context (a chat prompt). When true the
 * BE attaches `contextual_interestingness_score` to its queries, and the
 * sidebar ranks/marks every group in the thread by that prompt-relative score
 * instead of the generic `interestingness_score`. Decided once per thread so
 * the score source never varies query-by-query.
 */
function usesContextualInterestingness(thread: ExplorationThread): boolean {
  return Boolean(thread.prompt);
}

function getExplorationQueryTree(
  thread: ExplorationThread,
): ITreeNodeItem<ExplorationTreeNode>[] {
  const useContextual = usesContextualInterestingness(thread);
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
            status: getExplorationQueryGroupStatus(groupQueries),
            interestingness_score: useContextual
              ? getExplorationQueryGroupContextualInterestingness(groupQueries)
              : getExplorationQueryGroupInterestingness(groupQueries),
            parent_id: group.parent_group_id,
          },
        });
      }
    }
  }

  return headings.filter((heading) => (heading.children ?? []).length > 0);
}

function getExplorationDocumentTree(
  exploration: Exploration,
): ITreeNodeItem<ExplorationTreeDocument>[] {
  return (exploration.threads ?? []).flatMap((thread) => {
    const autoInsightsId = thread.auto_insights_document_id;
    // sort the documents so the auto insights document is first within each thread
    const documents = [...(thread.documents ?? [])].sort((a, b) => {
      if (autoInsightsId == null) {
        return 0;
      }
      const aIsAuto = a.id === autoInsightsId;
      const bIsAuto = b.id === autoInsightsId;
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
            document.id === thread.auto_insights_document_id &&
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
