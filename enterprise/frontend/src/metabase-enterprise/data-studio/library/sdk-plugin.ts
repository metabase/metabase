import { PLUGIN_LIBRARY } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useGetLibraryCollection } from "./hooks/use-get-library-collection";

/**
 * The part of the Library plugin the embedding data pickers read, without
 * Data Studio's routes and modals, which the SDK bundle doesn't need.
 */
export function initializePlugin() {
  if (hasPremiumFeature("library")) {
    PLUGIN_LIBRARY.useGetLibraryCollection = useGetLibraryCollection;
  }
}
