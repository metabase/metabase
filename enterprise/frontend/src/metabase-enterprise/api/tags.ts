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
  DependencyGraph,
  DependencyNode,
  PythonLibrary,
  SnippetDependencyNode,
  TableDependencyNode,
  Transform,
  TransformDependencyNode,
  TransformJob,
  TransformRun,
  TransformTag,
} from "metabase-types/api";

export const ENTERPRISE_TAG_TYPES = [
  ...TAG_TYPES,
  "scim",
  "metabot",
  "metabot-entities-list",
  "metabot-prompt-suggestions",
  "gsheets-status",
  "document",
  "comment",
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
