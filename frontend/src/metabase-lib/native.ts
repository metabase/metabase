import * as ML from "cljs/metabase.lib.js";

import type { DatabaseId } from "metabase-types/api";

import type { MetadataProvider, Query } from "./types";

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

export function withTemplateTags(query: Query, tags: string[]): Query {
  return ML.with_template_tags(query, tags);
}

export function templateTags(query: Query): string {
  return ML.template_tags(query);
}

export function extractTemplateTags(
  queryText: string,
  existingTags?: string,
): string | null {
  return ML.extract_template_tags(queryText, existingTags);
}

/**
 * Returns the extra keys that are required for this database's native queries, for example `:collection` name is
 *  needed for MongoDB queries.
 */
export function requiredNativeExtras(
  databaseId: DatabaseId,
  metadata: MetadataProvider,
): string[] {
  return ML.required_native_extras(databaseId, metadata);
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
