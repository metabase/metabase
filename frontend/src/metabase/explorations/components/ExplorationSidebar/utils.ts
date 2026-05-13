import { t } from "ttag";

import { AUTO_INSIGHTS_DOCUMENT_NAME } from "metabase/explorations/constants";
import type { RenderTreeNodePayload, TreeNodeData } from "metabase/ui";
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

export interface ExplorationTreeNodeData extends TreeNodeData {
  data: ExplorationTreeNode;
  children?: ExplorationTreeNodeData[];
}

export interface ExplorationTreeNodeItem extends ExplorationTreeNodeData {
  data: ExplorationTreeItem;
}

export function isExplorationTreeNodeItem(
  node: ExplorationTreeNodeData,
): node is ExplorationTreeNodeItem {
  return node.data.type === "document" || node.data.type === "group";
}

export interface ExplorationTreeNodeHeading extends ExplorationTreeNodeData {
  data: ExplorationTreeHeading;
}

export function isExplorationTreeNodeHeading(
  node: ExplorationTreeNodeData,
): node is ExplorationTreeNodeHeading {
  return node.data.type === "heading";
}

export interface ExplorationTreeNodePayloadItem extends RenderTreeNodePayload {
  node: ExplorationTreeNodeItem;
}

export function isExplorationTreeNodePayloadItem(
  payload: RenderTreeNodePayload,
): payload is ExplorationTreeNodePayloadItem {
  return (
    "data" in payload.node &&
    isExplorationTreeNodeItem(payload.node as ExplorationTreeNodeData)
  );
}

export interface ExplorationTreeNodePayloadHeading
  extends RenderTreeNodePayload {
  node: ExplorationTreeNodeHeading;
}

export function isExplorationTreeNodePayloadHeading(
  payload: RenderTreeNodePayload,
): payload is ExplorationTreeNodePayloadHeading {
  return (
    "data" in payload.node &&
    isExplorationTreeNodeHeading(payload.node as ExplorationTreeNodeData)
  );
}

export function getExplorationSidebarTree(
  exploration: Exploration,
): ExplorationTreeNodeData[] {
  const tree: ExplorationTreeNodeData[] = (exploration.threads ?? []).map(
    (thread, index) => {
      return {
        value: `thread-${thread.id}`,
        label: getExplorationThreadName(thread, index),
        data: {
          type: "heading",
        },
        children: getExplorationQueryTree(thread),
      };
    },
  );
  tree.push({
    value: "documents",
    label: t`Findings`,
    data: { type: "heading" },
    children: getExplorationDocumentTree(exploration),
  });
  return tree;
}

function getExplorationQueryTree(
  thread: ExplorationThread,
): ExplorationTreeNodeData[] {
  const groups = (thread.groups ?? []).filter(
    (group): group is ExplorationQueryGroup & { name: string } =>
      group.name != null, // don't show anything missing a name
  );

  const headings: ExplorationTreeNodeData[] = [];
  const headingsById = new Map<
    ExplorationQueryGroupId,
    ExplorationTreeNodeData
  >();

  // first pass - get the headings
  for (const group of groups) {
    if (group.parent_group_id != null) {
      continue;
    }
    const heading: ExplorationTreeNodeData = {
      value: group.id,
      label: group.name,
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
        value: group.id,
        label: dimensionName ? `By ${dimensionName}` : group.name,
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
): ExplorationTreeNodeData[] {
  return (exploration.threads ?? []).flatMap((thread) => {
    return (thread.documents ?? []).map((document) => {
      return {
        value: getDocumentTreeId(document.id),
        label: document.name,
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

export const DOCUMENT_TREE_ID_PREFIX = "document-";

export function getDocumentTreeId(id: DocumentId) {
  return `${DOCUMENT_TREE_ID_PREFIX}${id}`;
}

export function removeDocumentTreeIdPrefix(id: string): DocumentId {
  return parseInt(id.replace(DOCUMENT_TREE_ID_PREFIX, ""), 10);
}

export function filterExplorationTree(
  tree: ExplorationTreeNodeData[],
  filter: string,
): ExplorationTreeNodeData[] {
  const normalizedFilter = filter.trim().toLowerCase();
  if (normalizedFilter.length === 0) {
    return tree;
  }

  return tree.flatMap((node): ExplorationTreeNodeData[] => {
    if (node.data.type === "document") {
      return [];
    }

    if (node.data.type === "group") {
      const label = String(node.label).toLowerCase();
      return label.includes(normalizedFilter) ? [node] : [];
    }

    const filteredChildren = filterExplorationTree(
      node.children ?? [],
      normalizedFilter,
    );
    if (filteredChildren.length > 0) {
      return [{ ...node, children: filteredChildren }];
    }
    return [];
  });
}

export function flattenTree(
  nodes: ExplorationTreeNodeData[],
): ExplorationTreeNodeItem[] {
  const result: ExplorationTreeNodeData[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children?.length) {
      result.push(...flattenTree(node.children));
    }
  }
  return result.filter(isExplorationTreeNodeItem);
}
