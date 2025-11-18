import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useGetLibraryCollectionQuery } from "metabase-enterprise/api";
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
    PLUGIN_LIBRARY.useGetLibraryCollectionQuery = ({
      skip,
    }: { skip?: boolean } = {}) => {
      const { data = null, isLoading } = useGetLibraryCollectionQuery(
        undefined,
        { skip },
      );
      return { data, isLoading };
    };
  }
}
