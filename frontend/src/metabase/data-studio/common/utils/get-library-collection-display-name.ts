import { t } from "ttag";

import type { Collection } from "metabase-types/api";

export function getLibraryCollectionDisplayName(
  collection: Pick<Collection, "name" | "type">,
): string {
  return collection.type === "library" ? t`Semantic layer` : collection.name;
}
