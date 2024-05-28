import { createSelector } from "@reduxjs/toolkit";
import type { Location } from "history";

import { canonicalCollectionId } from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls/collections";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { Collection, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { ROOT_COLLECTION } from "./constants";

type Props = {
  collectionId?: Collection["id"];
  location?: Location;
  params?: { collectionId?: Collection["id"]; slug?: string };
};

function byCollectionIdProp(state: State, { collectionId }: Props) {
  return collectionId;
}

function byCollectionIdNavParam(state: State, { params }: Props) {
  return params && params.collectionId;
}

function byCollectionUrlId(state: State, { params, location }: Props) {
  const isCollectionPath =
    params &&
    params.slug &&
    location &&
    Urls.isCollectionPath(location.pathname);
  return isCollectionPath && Urls.extractCollectionId(params.slug);
}

function byCollectionQueryParameter(state: State, { location }: Props) {
  return location && location.query && location.query.collectionId;
}

const getInitialCollectionId = createSelector(
  [
    state => {
      const collections = state.entities.collections || {};
      return collections as Record<CollectionId, Collection>;
    },
    getUserPersonalCollectionId,

    // these are listed in order of priority
    byCollectionIdProp,
    byCollectionIdNavParam,
    byCollectionUrlId,
    byCollectionQueryParameter,
  ],
  (collections, personalCollectionId, ...collectionIds) => {
    const rootCollectionId = ROOT_COLLECTION.id as CollectionId;
    const allCollectionIds = [
      ...(collectionIds as CollectionId[]),
      rootCollectionId,
    ];

    if (personalCollectionId) {
      allCollectionIds.push(personalCollectionId);
    }

    for (const collectionId of allCollectionIds) {
      const collection = collections[collectionId];
      if (collection?.can_write) {
        return canonicalCollectionId(collectionId);
      }
    }

    const rootCollection = collections[rootCollectionId];

    return rootCollection?.can_write
      ? canonicalCollectionId(rootCollectionId)
      : canonicalCollectionId(personalCollectionId);
  },
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getInitialCollectionId;
