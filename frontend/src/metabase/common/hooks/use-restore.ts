import { useCallback } from "react";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import {
  Api,
  useUpdateCardMutation,
  useUpdateCollectionMutation,
  useUpdateDashboardMutation,
  useUpdateDocumentMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { TRASHABLE_MODELS, getParentEntityLink } from "metabase/archive/utils";
import { useToast } from "metabase/common/hooks/use-toast";
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
  name?: string;
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

export function isRestorable(item: { model: string }): item is RestorableItem {
  return TRASHABLE_MODELS.has(item.model);
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
  const [sendToast] = useToast();
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

      const redirect = getParentEntityLink(
        result.entity,
        result.parentCollection,
      );
      const name = item.name ?? result.entity.name;
      sendToast({
        message: t`${name} has been restored.`,
        actionLabel: t`View`,
        action: () => dispatch(push(redirect)),
      });

      return result;
    },
    [
      dispatch,
      sendToast,
      updateCard,
      updateDashboard,
      updateCollection,
      updateDocument,
    ],
  );
}
