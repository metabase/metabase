import * as ML from "cljs/metabase.lib.js";
import type { DatabaseId, TemplateTag, TemplateTags } from "metabase-types/api";

import type { MetadataProvider, Query, ValidationError } from "./types";

export const variableTemplateTags = new Set([
  "boolean",
  "date",
  "dimension",
  "number",
  "table",
  "temporal-unit",
  "text",
]);

export function isVariableTemplateTag(type: string | TemplateTag): boolean {
  if (typeof type === "string") {
    return variableTemplateTags.has(type);
  }
  return variableTemplateTags.has(type.type);
}

export function nativeQuery(
  databaseId: DatabaseId,
  metadata: MetadataProvider,
  innerQuery: string,
): Query {
  return ML.native_query(databaseId, metadata, innerQuery);
}

export function rawNativeQuery(query: Query): string {
  return ML.raw_native_query(query);
}

export function withNativeQuery(query: Query, innerQuery: string): Query {
  return ML.with_native_query(query, innerQuery);
}

export function withTemplateTags(query: Query, tags: TemplateTags): Query {
  return ML.with_template_tags(query, tags);
}

export function templateTags(query: Query): TemplateTags {
  return ML.template_tags(query);
}

/**
 * Returns the template tags of a native query as an array, ordered for display.
 *
 * Prefer this over `Object.values(templateTags(query))`: Clojure maps lose insertion order past 8 keys
 * (ClojureScript's PersistentArrayMap threshold), which used to scramble SQL filter widgets. The order here
 * comes from the query's explicit `template-tags-order` and survives reordering. See #5136.
 */
export function templateTagsInOrder(query: Query): TemplateTag[] {
  return ML.template_tags_in_order(query);
}

/**
 * Returns the explicit display order of a native query's template tags as tag names, or `null` if none is
 * recorded. See #5136.
 */
export function templateTagsOrder(query: Query): string[] | null {
  return ML.template_tags_order(query);
}

/**
 * Sets the explicit display order of a native query's template tags.
 *
 * `order` must contain every template tag name exactly once. This is what makes reordering SQL filter
 * widgets persist; previously order was derived from Clojure map iteration order. See #5136.
 */
export function withTemplateTagsOrder(query: Query, order: string[]): Query {
  return ML.with_template_tags_order(query, order);
}

export function hasWritePermission(query: Query): boolean {
  return ML.has_write_permission(query);
}

export function withDifferentDatabase(
  query: Query,
  databaseId: DatabaseId,
  metadata: MetadataProvider,
): Query {
  return ML.with_different_database(query, databaseId, metadata);
}

export function engine(query: Query): string | null {
  return ML.engine(query);
}

type NativeExtras = {
  collection?: string | null;
};

/**
 * Returns the extra keys for native queries associated with this query.
 */
export function nativeExtras(query: Query): NativeExtras | null {
  return ML.native_extras(query);
}

/**
 * Updates the extras required for the db to run this query. The first stage must be a native type. Will ignore extras
 * not in `required-native-extras`.
 */
export function withNativeExtras(
  query: Query,
  nativeExtras: NativeExtras | null,
): Query {
  return ML.with_native_extras(query, nativeExtras);
}

/**
 * Validates if the template tags in query are all valid and well-formed.
 */
export function validateTemplateTags(query: Query): ValidationError[] {
  return ML.validate_template_tags(query);
}
