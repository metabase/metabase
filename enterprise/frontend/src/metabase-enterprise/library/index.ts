import { PLUGIN_LIBRARY } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibrarySection } from "./components/LibrarySection";
import {
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
  getLibraryCollectionType,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("semantic_layer")) {
    PLUGIN_LIBRARY.isEnabled = true;
    PLUGIN_LIBRARY.LibrarySection = LibrarySection;
    PLUGIN_LIBRARY.getLibraryCollectionType = getLibraryCollectionType;
    PLUGIN_LIBRARY.canPlaceEntityInCollection = canPlaceEntityInCollection;
    PLUGIN_LIBRARY.canPlaceEntityInCollectionOrDescendants =
      canPlaceEntityInCollectionOrDescendants;
  }
}
