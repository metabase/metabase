import { useCallback } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import {
  Api,
  useUpdateCardMutation,
  useUpdateCollectionMutation,
  useUpdateDashboardMutation,
  useUpdateDocumentMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { useDispatch } from "metabase/redux";
import type {
  Card,
  CardId,
  Collection,
  CollectionEssentials,
  Dashboard,
  DashboardId,
  Document,
  DocumentId,
  RegularCollectionId,
} from "metabase-types/api";

type Restorable<M extends string, Id> = {
  model: M;
  id: Id;
  can_restore?: boolean;
};

export type RestorableItem =
  | Restorable<"card", CardId>
  | Restorable<"dataset", CardId>
  | Restorable<"metric", CardId>
  | Restorable<"dashboard", DashboardId>
  | Restorable<"collection", RegularCollectionId>
  | Restorable<"document", DocumentId>;

export type RestorableModel = RestorableItem["model"];

const RESTORABLE_MODELS = new Set<string>([
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
]);

export function isRestorable(item: { model: string }): item is RestorableItem {
  return RESTORABLE_MODELS.has(item.model);
}

export function canRestore(item: {
  model: string;
  can_restore?: boolean;
}): item is RestorableItem {
  return item.can_restore === true && isRestorable(item);
}

export type RestoredEntity = Card | Dashboard | Collection | Document;

export type RestoreResult = {
  entity: RestoredEntity;
  parentCollection: CollectionEssentials | Collection | undefined;
};

export function useRestore() {
  const dispatch = useDispatch();
  const [updateCard] = useUpdateCardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [updateCollection] = useUpdateCollectionMutation();
  const [updateDocument] = useUpdateDocumentMutation();

  return useCallback(
    async (item: RestorableItem): Promise<RestoreResult> => {
      const result: RestoreResult = await match(item)
        .with(
          { model: "card" },
          { model: "dataset" },
          { model: "metric" },
          async ({ id }) => {
            const entity = await updateCard({ id, archived: false }).unwrap();
            return { entity, parentCollection: entity.collection ?? undefined };
          },
        )
        .with({ model: "dashboard" }, async ({ id }) => {
          const entity = await updateDashboard({
            id,
            archived: false,
          }).unwrap();
          return { entity, parentCollection: entity.collection ?? undefined };
        })
        .with({ model: "collection" }, async ({ id }) => {
          const entity = await updateCollection({
            id,
            archived: false,
          }).unwrap();
          return {
            entity,
            parentCollection: _.last(entity.effective_ancestors ?? []),
          };
        })
        .with({ model: "document" }, async ({ id }) => {
          const entity = await updateDocument({
            id,
            archived: false,
          }).unwrap();
          return { entity, parentCollection: entity.collection ?? undefined };
        })
        .exhaustive();

      dispatch(Api.util.invalidateTags([listTag("bookmark")]));
      return result;
    },
    [dispatch, updateCard, updateDashboard, updateCollection, updateDocument],
  );
}
