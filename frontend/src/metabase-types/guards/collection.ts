import {
  LIBRARY_SUB_COLLECTION_TYPES,
  type LibrarySubCollectionType,
} from "metabase-types/api";

export function isLibrarySubCollectionType(
  type?: string | null,
): type is LibrarySubCollectionType {
  return LIBRARY_SUB_COLLECTION_TYPES.some(
    (sectionType) => sectionType === type,
  );
}
