import type { CollectionEssentials, SearchResult } from "metabase-types/api";
import type { BrowseFilters } from "metabase/browse/utils";

export const sortCollectionsByVerification = (
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
  return 0;
};

const isModelVerified = (model: SearchResult) =>
  model.moderated_status === "verified";

export const sortModelsByVerification = (a: SearchResult, b: SearchResult) => {
  const aVerified = isModelVerified(a);
  const bVerified = isModelVerified(b);
  if (aVerified && !bVerified) {
    return -1;
  }
  if (!aVerified && bVerified) {
    return 1;
  }
  return 0;
};

export const browseFilters: BrowseFilters = {
  onlyShowVerifiedModels: {
    predicate: model => model.moderated_status === "verified",
    activeByDefault: true,
  },
};
