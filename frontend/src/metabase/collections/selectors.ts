import { createSelector } from "@reduxjs/toolkit";
import Collections from "metabase/entities/collections";
import type { State } from "metabase-types/store";
import type { Bookmark, Collection, CollectionId } from "metabase-types/api";

type GetIsBookmarkedProps = {
  bookmarks: Bookmark[];
  collectionId: CollectionId;
};

export const getIsBookmarked = (_state: State, props: GetIsBookmarkedProps) =>
  props.bookmarks.some(
    bookmark =>
      bookmark.type === "collection" && bookmark.item_id === props.collectionId,
  );

interface GetCollectionProps {
  collectionId: CollectionId | undefined;
}

export const getCollection = createSelector(
  [
    (state: State) => state,
    (_, { collectionId }: GetCollectionProps) => collectionId,
  ],
  (state, collectionId): Collection | undefined =>
    Collections.selectors.getObject(state, {
      entityId: collectionId,
    }),
);
