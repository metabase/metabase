import type { TagDescription } from "@reduxjs/toolkit/query";

import { TAG_TYPES, provideUserTags } from "metabase/api/tags";
import type {
  Comment,
  Transform,
  TransformJob,
  TransformRun,
  TransformTag,
} from "metabase-types/api";

import type { PythonLibrary } from "./python-transform-library";

export const ENTERPRISE_TAG_TYPES = [
  ...TAG_TYPES,
  "scim",
  "metabot",
  "metabot-entities-list",
  "metabot-prompt-suggestions",
  "gsheets-status",
  "document",
  "comment",
  "transform",
  "transform-tag",
  "transform-job",
  "transform-job-via-tag",
  "transform-run",
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
