import { createSelector } from "@reduxjs/toolkit";

import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { RegularCollectionId } from "metabase-types/api";

// "CollectionId" from core app also includes "root" | "users" and "trash", we don't want to include those
// in public apis of the sdk, as we don't support them

export type SDKCollectionId = RegularCollectionId | "personal";

/**
 * converts 'personal' to the numeric id of the id of the 'personal' collection
 * id of the logged in user
 */
export const getNumericCollectionId = createSelector(
  [
    getUserPersonalCollectionId,
    (_, collectionId: SDKCollectionId | "root" | null) => collectionId,
  ],
  (personalCollectionId, collectionId) => {
    if (collectionId === "personal") {
      return personalCollectionId as RegularCollectionId;
    }

    if (collectionId === "root") {
      return "root" as const;
    }

    if (collectionId === null) {
      return null;
    }

    return collectionId as RegularCollectionId;
  },
);
