import { useCallback } from "react";
import { match } from "ts-pattern";

import {
  useDeleteCardMutation,
  useDeleteCollectionMutation,
  useDeleteDashboardMutation,
  useDeleteDocumentMutation,
} from "metabase/api";
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

const DELETABLE_MODELS = new Set<string>([
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
]);

export function canDelete(item: {
  model: string;
  can_delete?: boolean;
}): item is DeletableItem {
  return item.can_delete === true && DELETABLE_MODELS.has(item.model);
}

export function useDeleteItem() {
  const [deleteCard] = useDeleteCardMutation();
  const [deleteDashboard] = useDeleteDashboardMutation();
  const [deleteCollection] = useDeleteCollectionMutation();
  const [deleteDocument] = useDeleteDocumentMutation();

  return useCallback(
    (item: DeletableItem) =>
      match(item)
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
        .exhaustive(),
    [deleteCard, deleteDashboard, deleteCollection, deleteDocument],
  );
}
