import type { TagDescription } from "@reduxjs/toolkit/query";

import { TAG_TYPES } from "metabase/api/tags";
import type {
  Transform,
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
  "transform",
  "transform-tag",
  "transform-job",
  "transform-run",
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
  return [idTag("transform", transform.id)];
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
  return [idTag("transform-job", job.id)];
}

export function provideTransformJobListTags(
  jobs: TransformJob[],
): TagDescription<EnterpriseTagType>[] {
  return [listTag("transform-job"), ...jobs.flatMap(provideTransformJobTags)];
}
