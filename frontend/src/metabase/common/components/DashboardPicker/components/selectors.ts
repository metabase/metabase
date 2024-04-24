import { createSelector } from "@reduxjs/toolkit";

import { collectionApi } from "metabase/api";
import type { CollectionId, CollectionItem } from "metabase-types/api";

export const selectRootCollectionItems = (id: any) =>
  collectionApi.endpoints.listCollectionItems.select({
    id,
    models: ["collection", "dashboard"],
  });

export const selectCollectionItems = (parentId: CollectionId) =>
  createSelector(
    selectRootCollectionItems(parentId),
    collectionItems => collectionItems?.data?.data,
  );

export const dumbSelector = (state: any) => {
  const collectionItemsQueries = Object.entries(
    state["metabase-api"]?.queries,
  ).filter(([query]) => query.includes("listCollectionItems"));

  const collectionQueries = Object.entries(
    state["metabase-api"]?.queries,
  ).filter(([query]) => query.includes("getCollection"));

  const collectionsData = collectionQueries.flatMap(([_, v]) => ({
    ...v?.data,
    model: "collection",
  }));

  const collectionItemsData = collectionItemsQueries.flatMap(
    ([_, v]) => v?.data?.data,
  );

  return [...collectionsData, ...collectionItemsData];
};

export const getCollectionById = (
  id: CollectionId,
  collectionItems: CollectionItem[],
) => {
  return collectionItems.find(
    item => item.id === id && item.model === "collection",
  );
};
