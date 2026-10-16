import { PLUGIN_LIBRARY } from "metabase/plugins";
import {
  type CollectionItemModel,
  type CollectionType,
  LIBRARY_SUB_COLLECTION_TYPES,
  type LibrarySubCollectionType,
} from "metabase-types/api";

import { LIBRARY_SECTIONS } from "./library-sections";

// Questions can be saved into the dashboards inside the Dashboards section
const SECTION_DESCENDANT_MODELS: Record<
  LibrarySubCollectionType,
  readonly CollectionItemModel[]
> = {
  "library-data": [],
  "library-metrics": [],
  "library-dashboards": ["card"],
  "library-documents": [],
};

export function canPlaceEntityInCollection(
  entityType: CollectionItemModel,
  collectionType: CollectionType | null | undefined,
): boolean {
  if (!PLUGIN_LIBRARY.isLibraryCollectionType(collectionType)) {
    return true;
  }

  // Can't create anything in the root Library collection
  if (collectionType === "library") {
    return false;
  }

  return (
    entityType === "collection" ||
    entityType === LIBRARY_SECTIONS[collectionType].model
  );
}

export function canPlaceEntityInCollectionOrDescendants(
  entityType: CollectionItemModel,
  collectionType: CollectionType | null | undefined,
): boolean {
  if (canPlaceEntityInCollection(entityType, collectionType)) {
    return true;
  }

  if (collectionType === "library") {
    return LIBRARY_SUB_COLLECTION_TYPES.some((sectionType) =>
      canPlaceEntityInCollectionOrDescendants(entityType, sectionType),
    );
  }

  if (PLUGIN_LIBRARY.isLibrarySubCollectionType(collectionType)) {
    return SECTION_DESCENDANT_MODELS[collectionType].includes(entityType);
  }

  return false;
}
