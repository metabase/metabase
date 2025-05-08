import {
  engine as cljs_engine,
  has_write_permission,
  native_extras,
  native_query,
  raw_native_query,
  required_native_extras,
  template_tags,
  with_different_database,
  with_native_extras,
  with_native_query,
  with_template_tags,
} from "cljs/metabase.lib.js";
import type { DatabaseId, TemplateTags } from "metabase-types/api";

import type { MetadataProvider, Query } from "./types";

export function nativeQuery(
  databaseId: DatabaseId,
  metadata: MetadataProvider,
  innerQuery: string,
): Query {
  return native_query(databaseId, metadata, innerQuery);
}

export function rawNativeQuery(query: Query): string {
  return raw_native_query(query);
}

export function withNativeQuery(query: Query, innerQuery: string): Query {
  return with_native_query(query, innerQuery);
}

export function withTemplateTags(query: Query, tags: TemplateTags): Query {
  return with_template_tags(query, tags);
}

export function templateTags(query: Query): TemplateTags {
  return template_tags(query);
}

export function hasWritePermission(query: Query): boolean {
  return has_write_permission(query);
}

export function withDifferentDatabase(
  query: Query,
  databaseId: DatabaseId,
  metadata: MetadataProvider,
): Query {
  return with_different_database(query, databaseId, metadata);
}

export function engine(query: Query): string | null {
  return cljs_engine(query);
}

/**
 * Returns the extra keys that are required for this database's native queries, for example `:collection` name is
 *  needed for MongoDB queries.
 */
export function requiredNativeExtras(
  databaseId: DatabaseId,
  metadata: MetadataProvider,
): string[] {
  return required_native_extras(databaseId, metadata);
}

type NativeExtras = {
  collection?: string | null;
};

/**
 * Returns the extra keys for native queries associated with this query.
 */
export function nativeExtras(query: Query): NativeExtras | null {
  return native_extras(query);
}

/**
 * Updates the extras required for the db to run this query. The first stage must be a native type. Will ignore extras
 * not in `required-native-extras`.
 */
export function withNativeExtras(
  query: Query,
  nativeExtras: NativeExtras | null,
): Query {
  return with_native_extras(query, nativeExtras);
}
