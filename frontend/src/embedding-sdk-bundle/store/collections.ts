import { createSelector } from "@reduxjs/toolkit";
import { P, match } from "ts-pattern";

import {
  getUserPersonalCollectionId,
  getUserTenantCollectionId,
} from "metabase/selectors/user";
import type { CollectionId, RegularCollectionId } from "metabase-types/api";

import type { SdkCollectionId } from "../types/collection";

/**
 * Converts "personal", "tenant", and "root" to the ids accepted by the api
 * For the root collection id, the API expects null.
 */
export const getCollectionIdValueFromReference = createSelector(
  [
    getUserPersonalCollectionId,
    getUserTenantCollectionId,
    (_, collectionReference: SdkCollectionId) => collectionReference,
  ],
  (
    personalCollectionId,
    tenantCollectionId,
    collectionReference,
  ): CollectionId | null => {
    return match(collectionReference)
      .with("personal", () => personalCollectionId as RegularCollectionId)
      .with("tenant", () => {
        if (!tenantCollectionId) {
          throw new Error(
            "You must be a tenant member to access the tenant collection.",
          );
        }

        return tenantCollectionId as RegularCollectionId;
      })
      .with("root", () => null)
      .with(P.union(P.number, P.string), (id) => id)
      .otherwise(() => {
        throw new Error(
          "Invalid collection id, expected `number | string | 'root' | 'personal' | 'tenant'`",
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
    getUserTenantCollectionId,
    (_, collectionReference: SdkCollectionId) => collectionReference,
  ],
  (
    personalCollectionId,
    tenantCollectionId,
    collectionReference,
  ): CollectionId => {
    return match(collectionReference)
      .with("personal", () => personalCollectionId as RegularCollectionId)
      .with("tenant", () => {
        if (!tenantCollectionId) {
          throw new Error(
            "You must be a tenant member to access the tenant collection.",
          );
        }

        return tenantCollectionId as RegularCollectionId;
      })
      .with("root", () => "root" as const)
      .with(P.union(P.number, P.string), (id) => id)
      .otherwise(() => {
        throw new Error(
          "Invalid collection id, expected `number | string | 'root' | 'personal' | 'tenant'`",
        );
      });
  },
);
