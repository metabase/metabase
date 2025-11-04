import { createSelector } from "@reduxjs/toolkit";
import { P, match } from "ts-pattern";

import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { CollectionId, RegularCollectionId } from "metabase-types/api";

import type { SdkCollectionId } from "../types/collection";

/**
 * Converts "personal" and "root" to the ids accepted by the api
 * For the root collection id, the API expects null.
 */
export const getCollectionIdValueFromReference = createSelector(
  [
    getUserPersonalCollectionId,
    (_, collectionReference: SdkCollectionId) => collectionReference,
  ],
  (personalCollectionId, collectionReference): CollectionId | null => {
    return match(collectionReference)
      .with("personal", () => personalCollectionId as RegularCollectionId)
      .with("root", () => null)
      .with(P.union(P.number, P.string), (id) => id)
      .otherwise(() => {
        throw new Error(
          "Invalid collection id, expected `number | string | 'root' | 'personal'`",
        );
      });
  },
);

/**
 * This return an "id"/"slug" that can be used in `/api/collection/{:id}`
 * There are extra handlers for "root" and "trash" so unlike when
 * creating a dashboard, we have to pass "root" for the root collection
 * instead of null
 */
export const getCollectionIdSlugFromReference = createSelector(
  [
    getUserPersonalCollectionId,
    (_, collectionReference: SdkCollectionId) => collectionReference,
  ],
  (personalCollectionId, collectionReference): CollectionId => {
    return match(collectionReference)
      .with("personal", () => personalCollectionId as RegularCollectionId)
      .with("root", () => "root" as const)
      .with(P.union(P.number, P.string), (id) => id)
      .otherwise(() => {
        throw new Error(
          "Invalid collection id, expected `number | string | 'root' | 'personal'`",
        );
      });
  },
);
