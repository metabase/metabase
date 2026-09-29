import { PLUGIN_LIBRARY } from "metabase/plugins";
import type {
  CollectionAuthorityLevel,
  CollectionEssentials,
} from "metabase-types/api";

type AuthorityBearing = {
  collection_authority_level?: CollectionAuthorityLevel;
  collection?: CollectionEssentials | null;
};

/**
 * Official means the item's own collection is marked official, or the item is in the Library.
 * Authority level does not inherit in Metabase, so neither does this.
 */
export function isOfficialItem(item: AuthorityBearing): boolean {
  return (
    item.collection_authority_level === "official" ||
    item.collection?.authority_level === "official" ||
    PLUGIN_LIBRARY.isLibraryCollectionType(item.collection?.type)
  );
}

export function partitionByAuthority<T extends AuthorityBearing>(
  items: T[],
): { official: T[]; unofficial: T[] } {
  const official: T[] = [];
  const unofficial: T[] = [];

  for (const item of items) {
    (isOfficialItem(item) ? official : unofficial).push(item);
  }

  return { official, unofficial };
}
