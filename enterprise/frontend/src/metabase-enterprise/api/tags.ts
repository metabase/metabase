import type { TagDescription } from "@reduxjs/toolkit/query";

import type { TagType } from "metabase/api/tags";

export const ENTERPRISE_TAG_TYPES = [
  "scim",
  "metabot",
  "metabot-entities-list",
  "metabot-prompt-suggestions",
  "gsheets-status",
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
