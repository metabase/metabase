import { getLibQuery } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DraftTransformSource, Transform } from "metabase-types/api";

/**
 * True when saving `source` would leave an existing incremental (table-incremental)
 * native transform without the table variable its incremental filter relies on.
 *
 * Mirrors the backend validation in `metabase.transforms.crud`: a table-incremental
 * native transform requires a table template tag for the incremental range filter to be
 * injected into. Removing it leaves the transform in a broken state, so we warn the user
 * and offer to turn off incremental processing instead.
 */
export function isMissingIncrementalTableTag(
  transform: Transform,
  source: DraftTransformSource,
  metadata: Metadata,
): boolean {
  if (transform.target.type !== "table-incremental") {
    return false;
  }
  if (transform.source_type !== "native" || source.type !== "query") {
    return false;
  }

  const query = getLibQuery(source, metadata);
  const hasTableTag = query
    ? Object.values(Lib.templateTags(query)).some(
        (tag) => tag.type === "table" && tag["table-id"] != null,
      )
    : false;

  return !hasTableTag;
}
