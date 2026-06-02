import { useCallback } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  useDeleteCardMutation,
  useDeleteCollectionMutation,
  useDeleteDashboardMutation,
  useDeleteDocumentMutation,
} from "metabase/api";
import { TRASHABLE_MODELS } from "metabase/archive/utils";
import { useToast } from "metabase/common/hooks/use-toast";
import type {
  CardId,
  DashboardId,
  DocumentId,
  RegularCollectionId,
} from "metabase-types/api";

type Deletable<M extends string, Id> = {
  model: M;
  id: Id;
  can_delete?: boolean;
};

export type DeletableItem =
  | Deletable<"card", CardId>
  | Deletable<"dataset", CardId>
  | Deletable<"metric", CardId>
  | Deletable<"dashboard", DashboardId>
  | Deletable<"collection", RegularCollectionId>
  | Deletable<"document", DocumentId>;

export type DeletableModel = DeletableItem["model"];

export function isDeletable(item: { model: string }): item is DeletableItem {
  return TRASHABLE_MODELS.has(item.model);
}

export function canDelete(item: {
  model: string;
  can_delete?: boolean;
}): item is DeletableItem {
  return item.can_delete === true && isDeletable(item);
}

export function useDeleteItem() {
  const [sendToast] = useToast();
  const [deleteCard] = useDeleteCardMutation();
  const [deleteDashboard] = useDeleteDashboardMutation();
  const [deleteCollection] = useDeleteCollectionMutation();
  const [deleteDocument] = useDeleteDocumentMutation();

  return useCallback(
    async (
      item: DeletableItem,
      { notify = true }: { notify?: boolean } = {},
    ) => {
      await match(item)
        .with(
          { model: "card" },
          { model: "dataset" },
          { model: "metric" },
          ({ id }) => deleteCard(id).unwrap(),
        )
        .with({ model: "dashboard" }, ({ id }) => deleteDashboard(id).unwrap())
        .with({ model: "collection" }, ({ id }) =>
          deleteCollection({ id }).unwrap(),
        )
        .with({ model: "document" }, ({ id }) =>
          deleteDocument({ id }).unwrap(),
        )
        .exhaustive();

      if (notify) {
        sendToast({ message: t`This item has been permanently deleted.` });
      }
    },
    [sendToast, deleteCard, deleteDashboard, deleteCollection, deleteDocument],
  );
}
