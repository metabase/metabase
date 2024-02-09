import type { CollectionEssentials, SearchResult } from "metabase-types/api";
import type { BrowseFilters } from "metabase/browse/utils";

export const sortCollectionsForBrowseModels = (
  collection1: CollectionEssentials,
  collection2: CollectionEssentials,
) => {
  const isCollection1Official = collection1.authority_level === "official";
  const isCollection2Official = collection2.authority_level === "official";
  if (isCollection1Official && !isCollection2Official) {
    return -1;
  }
  if (isCollection2Official && !isCollection1Official) {
    return 1;
  }
  return null;
};

export const browseFilters: BrowseFilters = {
  onlyShowVerifiedModels: {
    predicate: (model): model is SearchResult =>
      model.moderated_status === "verified",
    active: true,
  },
};
