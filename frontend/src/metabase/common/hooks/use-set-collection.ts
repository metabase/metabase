import { useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  useUpdateCardMutation,
  useUpdateCollectionMutation,
  useUpdateDashboardMutation,
  useUpdateDocumentMutation,
  useUpdateTimelineMutation,
} from "metabase/api";
import {
  canonicalCollectionId,
  isItemCollection,
  isLibraryCollection,
  isReadOnlyCollection,
  isRootPersonalCollection,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { getDefaultTimelineName } from "metabase/common/utils/timelines";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type {
  Card,
  Collection,
  CollectionItem,
  Dashboard,
  DashboardId,
  Document,
  Timeline,
} from "metabase-types/api";

type Movable<
  M extends string,
  T extends { id: unknown },
  K extends keyof T = never,
> = {
  model: M;
  id: T["id"];
} & Pick<T, K>;

export type MovableItem =
  | Movable<"card", Card, "collection_id" | "dashboard_id">
  | Movable<"dataset", Card, "collection_id" | "dashboard_id">
  | Movable<"metric", Card, "collection_id" | "dashboard_id">
  | Movable<"dashboard", Dashboard, "collection_id">
  | Movable<"collection", Collection, "parent_id">
  | Movable<"snippet-collection", Collection, "parent_id">
  | Movable<"document", Document, "collection_id">
  | Movable<
      "timeline",
      Timeline,
      "name" | "default" | "collection" | "collection_id"
    >;

type TimelineMovable = Extract<MovableItem, { model: "timeline" }>;

export type MovableModel = MovableItem["model"];

const MOVABLE_MODELS = new Set<MovableModel>([
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "snippet-collection",
  "document",
  "timeline",
]);

export function isMovable<T extends { model: string }>(
  item: T,
): item is T & { model: MovableModel } {
  return MOVABLE_MODELS.has(item.model as MovableModel);
}

export type SetCollectionDestination =
  | (Pick<Collection, "id"> &
      Partial<Pick<Collection, "type">> & { model?: "collection" })
  | (Pick<Dashboard, "id"> & { model: "dashboard" });

const LABELS = {
  card: () => t`question`,
  dataset: () => t`model`,
  metric: () => t`metric`,
  dashboard: () => t`dashboard`,
  collection: () => t`collection`,
  "snippet-collection": () => t`folder`,
  document: () => t`document`,
  timeline: () => t`timeline`,
} as const satisfies Record<MovableModel, () => string>;

export type SetCollectionOptions = {
  notify?: boolean;
};

function getMovableTimelineName(timeline: TimelineMovable): string {
  return timeline.default && timeline.collection
    ? getDefaultTimelineName(timeline.collection)
    : timeline.name;
}

function isCollectionDestination(
  destination: SetCollectionDestination,
): destination is Pick<Collection, "id"> &
  Partial<Pick<Collection, "type">> & { model?: "collection" } {
  return destination.model !== "dashboard";
}

export function useSetCollection() {
  const dispatch = useDispatch();
  const [updateCard] = useUpdateCardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [updateCollection] = useUpdateCollectionMutation();
  const [updateDocument] = useUpdateDocumentMutation();
  const [updateTimeline] = useUpdateTimelineMutation();

  const setCollection = useCallback(
    (item: MovableItem, destination: SetCollectionDestination) => {
      const archived =
        isCollectionDestination(destination) &&
        isRootTrashCollection(destination);

      return match(item)
        .with(
          { model: "card" },
          { model: "dataset" },
          { model: "metric" },
          ({ id }) => {
            const update = isCollectionDestination(destination)
              ? {
                  collection_id: canonicalCollectionId(destination.id),
                  dashboard_id: null,
                  archived,
                }
              : {
                  dashboard_id: destination.id as DashboardId,
                  archived: false,
                  delete_old_dashcards: true,
                };
            return updateCard({ id, ...update }).unwrap();
          },
        )
        .with({ model: "dashboard" }, ({ id }) => {
          if (!isCollectionDestination(destination)) {
            throw new Error("Cannot move a dashboard into a dashboard");
          }
          return updateDashboard({
            id,
            collection_id: canonicalCollectionId(destination.id),
            archived,
          }).unwrap();
        })
        .with({ model: "document" }, ({ id }) => {
          if (!isCollectionDestination(destination)) {
            throw new Error("Cannot move a document into a dashboard");
          }
          return updateDocument({
            id,
            collection_id: canonicalCollectionId(destination.id),
            archived,
          }).unwrap();
        })
        .with({ model: "collection" }, ({ id }) => {
          if (!isCollectionDestination(destination)) {
            throw new Error("Cannot move a collection into a dashboard");
          }
          return updateCollection({
            id,
            parent_id: canonicalCollectionId(destination.id),
            archived,
          }).unwrap();
        })
        .with({ model: "snippet-collection" }, ({ id }) => {
          if (!isCollectionDestination(destination)) {
            throw new Error("Cannot move a snippet folder into a dashboard");
          }
          return updateCollection({
            id,
            parent_id: canonicalCollectionId(destination.id),
          }).unwrap();
        })
        .with({ model: "timeline" }, (timeline) => {
          if (!isCollectionDestination(destination)) {
            throw new Error("Cannot move a timeline into a dashboard");
          }
          return updateTimeline({
            id: timeline.id,
            name: getMovableTimelineName(timeline),
            collection_id: canonicalCollectionId(destination.id),
            default: false,
          }).unwrap();
        })
        .exhaustive();
    },
    [
      updateCard,
      updateDashboard,
      updateCollection,
      updateDocument,
      updateTimeline,
    ],
  );

  const undoMove = useCallback(
    (item: MovableItem) =>
      match(item)
        .with(
          { model: "card" },
          { model: "dataset" },
          { model: "metric" },
          ({ id, collection_id, dashboard_id }) =>
            updateCard({ id, collection_id, dashboard_id, archived: false }),
        )
        .with({ model: "dashboard" }, ({ id, collection_id }) =>
          updateDashboard({ id, collection_id, archived: false }),
        )
        .with({ model: "document" }, ({ id, collection_id }) =>
          updateDocument({ id, collection_id, archived: false }),
        )
        .with({ model: "collection" }, ({ id, parent_id }) =>
          updateCollection({ id, parent_id, archived: false }),
        )
        .with({ model: "snippet-collection" }, ({ id, parent_id }) =>
          updateCollection({ id, parent_id }),
        )
        .with({ model: "timeline" }, (timeline) =>
          updateTimeline({
            id: timeline.id,
            name: getMovableTimelineName(timeline),
            collection_id: timeline.collection_id,
          }),
        )
        .exhaustive(),
    [
      updateCard,
      updateDashboard,
      updateCollection,
      updateDocument,
      updateTimeline,
    ],
  );

  return useCallback(
    async (
      item: MovableItem,
      destination: SetCollectionDestination,
      { notify = true }: SetCollectionOptions = {},
    ) => {
      const result = await setCollection(item, destination);

      if (notify) {
        dispatch(
          addUndo({
            subject: LABELS[item.model](),
            verb: t`moved`,
            actions: [() => undoMove(item)],
          }),
        );
      }

      return result;
    },
    [dispatch, setCollection, undoMove],
  );
}

export function canMoveItem(item: CollectionItem, collection?: Collection) {
  return (
    (collection?.can_write || isRootTrashCollection(collection)) &&
    !isReadOnlyCollection(item) &&
    isMovable(item) &&
    !(isItemCollection(item) && isRootPersonalCollection(item)) &&
    !isLibraryCollection(item as Pick<Collection, "type">)
  );
}
