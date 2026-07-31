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
    return (
      match(collectionReference)
        // Unjustified type cast. FIXME
        .with("personal", () => personalCollectionId as RegularCollectionId)
        .with("tenant", () => {
          if (!tenantCollectionId) {
            throw new Error(
              "You must be a tenant member to access the tenant collection.",
            );
          }

          return tenantCollectionId;
        })
        .with("root", () => null)
        .with(P.union(P.number, P.string), (id) => id)
        .otherwise(() => {
          throw new Error(
            "Invalid collection id, expected `number | string | 'root' | 'personal' | 'tenant'`",
          );
        })
    );
  },
);

/**
 * Returns an "id"/"slug" for `/api/collection/{:id}` — unlike when creating a
 * dashboard, the root collection is `"root"` here rather than null.
 *
 * `undefined` when `"personal"` can't be resolved: `currentUser` hasn't loaded
 * yet, or has no personal collection. Callers must handle that (e.g. with
 * `skipToken`) — `/api/collection/undefined` is a 404.
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
  ): CollectionId | undefined => {
    return match(collectionReference)
      .with("personal", () => personalCollectionId)
      .with("tenant", () => {
        if (!tenantCollectionId) {
          throw new Error(
            "You must be a tenant member to access the tenant collection.",
          );
        }

        return tenantCollectionId;
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
