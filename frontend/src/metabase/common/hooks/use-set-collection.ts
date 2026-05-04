import type { ReactNode } from "react";
import { useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  cardApi,
  collectionApi,
  dashboardApi,
  documentApi,
  timelineApi,
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
  | Movable<"card", Card>
  | Movable<"dataset", Card>
  | Movable<"metric", Card>
  | Movable<"dashboard", Dashboard>
  | Movable<"collection", Collection>
  | Movable<"snippet-collection", Collection>
  | Movable<"document", Document>
  | Movable<"timeline", Timeline, "name">;

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
  message?: ReactNode;
};

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
        .with({ model: "timeline" }, ({ id, name }) => {
          if (!isCollectionDestination(destination)) {
            throw new Error("Cannot move a timeline into a dashboard");
          }
          return updateTimeline({
            id,
            name,
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

  const captureUndoAction = useCallback(
    (item: MovableItem): Promise<() => Promise<unknown>> =>
      match(item)
        .with(
          { model: "card" },
          { model: "dataset" },
          { model: "metric" },
          async ({ id }) => {
            const card = await dispatch(
              cardApi.endpoints.getCard.initiate({ id }),
            ).unwrap();
            return () =>
              updateCard({
                id,
                collection_id: card.collection_id,
                dashboard_id: card.dashboard_id,
                archived: card.archived,
              });
          },
        )
        .with({ model: "dashboard" }, async ({ id }) => {
          const dashboard = await dispatch(
            dashboardApi.endpoints.getDashboard.initiate({ id }),
          ).unwrap();
          return () =>
            updateDashboard({
              id,
              collection_id: dashboard.collection_id,
              archived: dashboard.archived,
            });
        })
        .with({ model: "document" }, async ({ id }) => {
          const document = await dispatch(
            documentApi.endpoints.getDocument.initiate({ id }),
          ).unwrap();
          return () =>
            updateDocument({
              id,
              collection_id: document.collection_id,
              archived: document.archived,
            });
        })
        .with(
          { model: "collection" },
          { model: "snippet-collection" },
          async ({ id }) => {
            const collection = await dispatch(
              collectionApi.endpoints.getCollection.initiate({ id }),
            ).unwrap();
            return () =>
              updateCollection({
                id,
                parent_id: collection.parent_id ?? null,
                archived: collection.archived ?? false,
              });
          },
        )
        .with({ model: "timeline" }, async ({ id }) => {
          const timeline = await dispatch(
            timelineApi.endpoints.getTimeline.initiate({ id }),
          ).unwrap();
          return () =>
            updateTimeline({
              id,
              name: timeline.name,
              collection_id: timeline.collection_id,
              default: timeline.default,
            });
        })
        .exhaustive(),
    [
      dispatch,
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
      { notify = true, message }: SetCollectionOptions = {},
    ) => {
      const undoAction = notify ? await captureUndoAction(item) : null;

      const result = await setCollection(item, destination);

      if (undoAction) {
        dispatch(
          addUndo({
            subject: LABELS[item.model](),
            verb: t`moved`,
            message,
            actions: [undoAction],
          }),
        );
      }

      return result;
    },
    [dispatch, setCollection, captureUndoAction],
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
