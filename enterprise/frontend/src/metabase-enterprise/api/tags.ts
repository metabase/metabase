import type { TagDescription } from "@reduxjs/toolkit/query";

import type { TagType } from "metabase/api/tags";
import {
  TAG_TYPES,
  provideCollectionTags,
  provideDatabaseTags,
  provideFieldListTags,
  provideTableTags,
  provideUserTags,
} from "metabase/api/tags";
import {
  type CardDependencyNode,
  DEPENDENCY_TYPES,
  type DashboardDependencyNode,
  type DependencyGraph,
  type DependencyNode,
  type DocumentDependencyNode,
  type ExternalTransform,
  type MeasureDependencyNode,
  type PythonLibrary,
  type SandboxDependencyNode,
  type SegmentDependencyNode,
  type SnippetDependencyNode,
  type SupportAccessGrant,
  type TableDependencyNode,
  type TransformDependencyNode,
  type Workspace,
  type WorkspaceAllowedDatabase,
  type WorkspaceItem,
} from "metabase-types/api";

export const ENTERPRISE_TAG_TYPES = [
  ...TAG_TYPES,
  "scim",
  "metabot",
  "metabot-entities-list",
  "metabot-prompt-suggestions",
  "gsheets-status",
  "sandbox",
  "workspace-transforms",
  "workspace-transform",
  "workspace-tables",
  "external-transform",
  "git-tree",
  "git-file-content",
  "collection-dirty-entities",
  "collection-is-dirty",
  "remote-sync-branches",
  "remote-sync-current-task",
  "remote-sync-has-remote-changes",
  "python-transform-library",
  "workspace",
  "support-access-grant",
  "support-access-grant-current",
  "library-collection",
] as const;

export type EnterpriseTagType = TagType | (typeof ENTERPRISE_TAG_TYPES)[number];

export function tag(
  type: EnterpriseTagType,
): TagDescription<EnterpriseTagType> {
  return { type };
}

export function listTag(
  type: EnterpriseTagType,
): TagDescription<EnterpriseTagType> {
  return { type, id: "LIST" };
}

export function idTag(
  type: EnterpriseTagType,
  id: string | number,
): TagDescription<EnterpriseTagType> {
  return { type, id };
}

export function invalidateTags(
  error: unknown,
  tags: TagDescription<EnterpriseTagType>[],
): TagDescription<EnterpriseTagType>[] {
  return !error ? tags : [];
}

export function provideWorkspacesTags(
  workspaces: Workspace[],
): TagDescription<EnterpriseTagType>[] {
  return [listTag("workspace"), ...workspaces.flatMap(provideWorkspaceTags)];
}

export function provideWorkspaceTags(
  workspace: Workspace | WorkspaceItem,
): TagDescription<EnterpriseTagType>[] {
  return [idTag("workspace", workspace.id)];
}

export function provideExternalTransformTags(
  transform: ExternalTransform,
): TagDescription<EnterpriseTagType>[] {
  return [idTag("external-transform", transform.id)];
}

export function provideExternalTransformListTags(
  transforms: ExternalTransform[],
): TagDescription<EnterpriseTagType>[] {
  return [
    listTag("external-transform"),
    ...transforms.flatMap(provideExternalTransformTags),
  ];
}

export function providePythonLibraryTags(
  library: PythonLibrary,
): TagDescription<EnterpriseTagType>[] {
  return [idTag("python-transform-library", library.path)];
}

function provideCardDependencyNodeTags(
  node: CardDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("card", node.id),
    ...(node.data.creator != null ? provideUserTags(node.data.creator) : []),
    ...(node.data["last-edit-info"] != null
      ? provideUserTags(node.data["last-edit-info"])
      : []),
    ...(node.data.collection != null
      ? provideCollectionTags(node.data.collection)
      : []),
    ...(node.data.dashboard != null
      ? [idTag("dashboard", node.data.dashboard.id)]
      : []),
  ];
}

function provideTableDependencyNodeTags(
  node: TableDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("table", node.id),
    ...(node.data.db != null ? provideDatabaseTags(node.data.db) : []),
    ...(node.data.fields != null ? provideFieldListTags(node.data.fields) : []),
  ];
}

function provideTransformDependencyNodeTags(
  node: TransformDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("transform", node.id),
    ...(node.data.table != null ? provideTableTags(node.data.table) : []),
  ];
}

function provideSnippetDependencyNodeTags(
  node: SnippetDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [idTag("snippet", node.id)];
}

function provideDashboardDependencyNodeTags(
  node: DashboardDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("dashboard", node.id),
    ...(node.data.creator != null ? provideUserTags(node.data.creator) : []),
    ...(node.data["last-edit-info"] != null
      ? provideUserTags(node.data["last-edit-info"])
      : []),
    ...(node.data.collection != null
      ? provideCollectionTags(node.data.collection)
      : []),
  ];
}

function provideDocumentDependencyNodeTags(
  node: DocumentDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("document", node.id),
    ...(node.data.creator != null ? provideUserTags(node.data.creator) : []),
    ...(node.data.collection != null
      ? provideCollectionTags(node.data.collection)
      : []),
  ];
}

function provideSandboxDependencyNodeTags(
  node: SandboxDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("sandbox", node.id),
    ...(node.data.table ? provideTableTags(node.data.table) : []),
  ];
}

function provideSegmentDependencyNodeTags(
  node: SegmentDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("segment", node.id),
    ...(node.data.creator != null ? provideUserTags(node.data.creator) : []),
    ...(node.data.table ? provideTableTags(node.data.table) : []),
  ];
}

function provideMeasureDependencyNodeTags(
  node: MeasureDependencyNode,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("measure", node.id),
    ...(node.data.creator != null ? provideUserTags(node.data.creator) : []),
    ...(node.data.table ? provideTableTags(node.data.table) : []),
  ];
}

export function provideDependencyNodeTags(
  node: DependencyNode,
): TagDescription<EnterpriseTagType>[] {
  switch (node.type) {
    case "card":
      return provideCardDependencyNodeTags(node);
    case "table":
      return provideTableDependencyNodeTags(node);
    case "transform":
      return provideTransformDependencyNodeTags(node);
    case "snippet":
      return provideSnippetDependencyNodeTags(node);
    case "dashboard":
      return provideDashboardDependencyNodeTags(node);
    case "document":
      return provideDocumentDependencyNodeTags(node);
    case "sandbox":
      return provideSandboxDependencyNodeTags(node);
    case "segment":
      return provideSegmentDependencyNodeTags(node);
    case "measure":
      return provideMeasureDependencyNodeTags(node);
    case "workspace-transform":
      return [idTag("workspace-transform", node.id)];
  }
}

export function provideDependencyNodeListTags(nodes: DependencyNode[]) {
  return [
    ...DEPENDENCY_TYPES.map(listTag),
    ...nodes.flatMap(provideDependencyNodeTags),
  ];
}

export function provideDependencyGraphTags(
  graph: DependencyGraph,
): TagDescription<EnterpriseTagType>[] {
  return provideDependencyNodeListTags(graph.nodes);
}

export function provideSupportAccessGrantTags(
  grant: SupportAccessGrant,
): TagDescription<EnterpriseTagType>[] {
  return [idTag("support-access-grant", grant.id)];
}

export function provideSupportAccessGrantListTags(
  grants: SupportAccessGrant[],
): TagDescription<EnterpriseTagType>[] {
  return [
    listTag("support-access-grant"),
    ...grants.flatMap(provideSupportAccessGrantTags),
  ];
}

export function provideWorkspaceAllowedDatabaseTags(
  databases: WorkspaceAllowedDatabase[],
) {
  return [
    listTag("database"),
    ...databases.map((db) => idTag("database", db.id)),
  ];
}
