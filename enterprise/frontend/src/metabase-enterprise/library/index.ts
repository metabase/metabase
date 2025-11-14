import { PLUGIN_LIBRARY } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { LibrarySection } from "./components/LibrarySection";
import { NavbarLibrarySection } from "./components/NavbarLibrarySection";
import {
  canPlaceEntityInCollection,
  canPlaceEntityInCollectionOrDescendants,
  getLibraryCollectionType,
} from "./utils";

export function initializePlugin() {
  if (hasPremiumFeature("library")) {
    PLUGIN_LIBRARY.isEnabled = true;
    PLUGIN_LIBRARY.LibrarySection = LibrarySection;
    PLUGIN_LIBRARY.NavbarLibrarySection = NavbarLibrarySection;
    PLUGIN_LIBRARY.getLibraryCollectionType = getLibraryCollectionType;
    PLUGIN_LIBRARY.canPlaceEntityInCollection = canPlaceEntityInCollection;
    PLUGIN_LIBRARY.canPlaceEntityInCollectionOrDescendants =
      canPlaceEntityInCollectionOrDescendants;
  }
}
