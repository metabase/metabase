import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { AUTO_INSIGHTS_DOCUMENT_NAME } from "metabase/explorations/constants";
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

export interface ExplorationTreeHeading {
  type: "heading";
}

export interface ExplorationTreeQueryGroup {
  type: "group";
  group_id: ExplorationQueryGroupId;
  query_ids: ExplorationQueryId[];
  status: ExplorationQueryStatus;
  interestingness_score: number | null;
}

export interface ExplorationTreeDocument {
  type: "document";
  id: DocumentId;
  status: ExplorationQueryStatus;
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
      // TODO delete me - this is a hack and won't work with translations
      const dimensionName = group.name.split(" by ")[1];
      heading.children.push({
        id: group.id,
        name: dimensionName ? `By ${dimensionName}` : group.name,
        icon: "lineandbar",
        data: {
          type: "group",
          group_id: group.id,
          query_ids: group.query_ids,
          status: getExplorationQueryGroupStatus(groupQueries),
          interestingness_score:
            getExplorationQueryGroupInterestingness(groupQueries),
        },
      });
    }
  }

  return headings.filter((heading) => (heading.children ?? []).length > 0);
}

function getExplorationDocumentTree(
  exploration: Exploration,
): ITreeNodeItem<ExplorationTreeDocument>[] {
  return (exploration.threads ?? []).flatMap((thread) => {
    return (thread.documents ?? []).map((document) => {
      return {
        id: document.id,
        name: document.name,
        icon: "document",
        data: {
          type: "document",
          id: document.id,
          status:
            document.name === AUTO_INSIGHTS_DOCUMENT_NAME &&
            thread.started_at != null &&
            thread.completed_at == null
              ? "running"
              : "done",
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
  return t`New exploration`;
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
