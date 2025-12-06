import type { TagDescription } from "@reduxjs/toolkit/query";

import {
  TAG_TYPES,
  provideCollectionTags,
  provideDatabaseTags,
  provideFieldListTags,
  provideTableTags,
  provideUserTags,
} from "metabase/api/tags";
import type {
  CardDependencyNode,
  Comment,
  DashboardDependencyNode,
  DependencyGraph,
  DependencyNode,
  DocumentDependencyNode,
  GetUnreferencedItemsResponse,
  PythonLibrary,
  SandboxDependencyNode,
  SegmentDependencyNode,
  SnippetDependencyNode,
  SupportAccessGrant,
  TableDependencyNode,
  Transform,
  TransformDependencyNode,
  TransformJob,
  TransformRun,
  TransformTag,
  UnreferencedItem,
} from "metabase-types/api";

export const ENTERPRISE_TAG_TYPES = [
  ...TAG_TYPES,
  "scim",
  "metabot",
  "metabot-entities-list",
  "metabot-prompt-suggestions",
  "gsheets-status",
  "document",
  "public-document",
  "comment",
  "sandbox",
  "transform-tag",
  "transform-job",
  "transform-job-via-tag",
  "transform-run",
  "git-tree",
  "git-file-content",
  "collection-dirty-entities",
  "collection-is-dirty",
  "remote-sync-branches",
  "remote-sync-current-task",
  "python-transform-library",
  "support-access-grant",
  "support-access-grant-current",
  "library-collection",
] as const;

export type EnterpriseTagType = (typeof ENTERPRISE_TAG_TYPES)[number];

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

export function provideTransformTags(
  transform: Transform,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("transform", transform.id),
    ...(transform.tag_ids?.flatMap((tag) => idTag("transform-tag", tag)) ?? []),
  ];
}

export function provideTransformListTags(
  transforms: Transform[],
): TagDescription<EnterpriseTagType>[] {
  return [listTag("transform"), ...transforms.flatMap(provideTransformTags)];
}

export function provideTransformRunTags(
  run: TransformRun,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("transform-run", run.id),
    ...(run.transform ? provideTransformTags(run.transform) : []),
  ];
}

export function provideTransformRunListTags(
  runs: TransformRun[],
): TagDescription<EnterpriseTagType>[] {
  return [listTag("transform-run"), ...runs.flatMap(provideTransformRunTags)];
}

export function provideTransformTagTags(
  tag: TransformTag,
): TagDescription<EnterpriseTagType>[] {
  return [idTag("transform-tag", tag.id)];
}

export function provideTransformTagListTags(
  tags: TransformTag[],
): TagDescription<EnterpriseTagType>[] {
  return [listTag("transform-tag"), ...tags.flatMap(provideTransformTagTags)];
}

export function provideTransformJobTags(
  job: TransformJob,
): TagDescription<EnterpriseTagType>[] {
  return [
    idTag("transform-job", job.id),
    ...(job.tag_ids?.map((tagId) => idTag("transform-job-via-tag", tagId)) ??
      []),
  ];
}

export function provideTransformJobListTags(
  jobs: TransformJob[],
): TagDescription<EnterpriseTagType>[] {
  return [listTag("transform-job"), ...jobs.flatMap(provideTransformJobTags)];
}

export function provideCommentListTags(
  comments: Comment[],
): TagDescription<EnterpriseTagType>[] {
  return [listTag("comment"), ...comments.flatMap(provideCommentTags)];
}

export function provideCommentTags(
  comment: Comment,
): TagDescription<EnterpriseTagType>[] {
  if (comment.creator) {
    return [idTag("comment", comment.id), ...provideUserTags(comment.creator)];
  }

  return [idTag("comment", comment.id)];
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
  }
}

export function provideDependencyNodeListTags(nodes: DependencyNode[]) {
  return [
    listTag("card"),
    listTag("table"),
    listTag("transform"),
    listTag("snippet"),
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

function provideUnreferencedItemTags(
  item: UnreferencedItem,
): TagDescription<EnterpriseTagType>[] {
  switch (item.type) {
    case "card":
      return [
        idTag("card", item.id),
        ...(item.data.creator != null
          ? provideUserTags(item.data.creator)
          : []),
        ...(item.data["last-edit-info"] != null
          ? provideUserTags(item.data["last-edit-info"])
          : []),
        ...(item.data.collection != null
          ? provideCollectionTags(item.data.collection)
          : []),
        ...(item.data.dashboard != null
          ? [idTag("dashboard", item.data.dashboard.id)]
          : []),
      ];
    case "table":
      return [
        idTag("table", item.id),
        ...(item.data.db != null ? provideDatabaseTags(item.data.db) : []),
      ];
    case "transform":
      return [
        idTag("transform", item.id),
        ...(item.data.table != null ? provideTableTags(item.data.table) : []),
      ];
    case "snippet":
      return [idTag("snippet", item.id)];
    case "dashboard":
      return [
        idTag("dashboard", item.id),
        ...(item.data.creator != null
          ? provideUserTags(item.data.creator)
          : []),
        ...(item.data["last-edit-info"] != null
          ? provideUserTags(item.data["last-edit-info"])
          : []),
        ...(item.data.collection != null
          ? provideCollectionTags(item.data.collection)
          : []),
      ];
    case "document":
      return [
        idTag("document", item.id),
        ...(item.data.creator != null
          ? provideUserTags(item.data.creator)
          : []),
        ...(item.data.collection != null
          ? provideCollectionTags(item.data.collection)
          : []),
      ];
    case "sandbox":
      return [
        idTag("sandbox", item.id),
        ...(item.data.table != null ? provideTableTags(item.data.table) : []),
      ];
  }
}

export function provideUnreferencedItemsResponseTags(
  response: GetUnreferencedItemsResponse,
): TagDescription<EnterpriseTagType>[] {
  return [
    listTag("card"),
    listTag("table"),
    listTag("transform"),
    listTag("snippet"),
    listTag("dashboard"),
    listTag("document"),
    listTag("sandbox"),
    ...response.data.flatMap(provideUnreferencedItemTags),
  ];
}
