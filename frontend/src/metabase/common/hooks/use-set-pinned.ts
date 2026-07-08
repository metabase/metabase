import { useCallback } from "react";
import { match } from "ts-pattern";

import {
  useUpdateCardMutation,
  useUpdateDashboardMutation,
  useUpdateDocumentMutation,
} from "metabase/api";
import type {
  Card,
  Collection,
  CollectionItem,
  Dashboard,
  Document,
} from "metabase-types/api";

type Pinnable<M extends string, T extends { id: unknown }> = {
  model: M;
  id: T["id"];
};

export type PinnableItem =
  | Pinnable<"card", Card>
  | Pinnable<"dataset", Card>
  | Pinnable<"metric", Card>
  | Pinnable<"dashboard", Dashboard>
  | Pinnable<"document", Document>;

export type PinnableModel = PinnableItem["model"];

const PINNABLE_MODELS = new Set<PinnableModel>([
  "card",
  "dataset",
  "metric",
  "dashboard",
  "document",
]);

export function isPinnable<T extends { model: string }>(
  item: T,
): item is T & { model: PinnableModel } {
  return PINNABLE_MODELS.has(item.model as PinnableModel);
}

export function canPinItem(item: CollectionItem, collection?: Collection) {
  return !!collection?.can_write && isPinnable(item) && !item.archived;
}

function toCollectionPosition(pinned: boolean | number): number | null {
  if (typeof pinned === "number") {
    return pinned;
  }
  return pinned ? 1 : null;
}

export function useSetPinned() {
  const [updateCard] = useUpdateCardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [updateDocument] = useUpdateDocumentMutation();

  return useCallback(
    (item: PinnableItem, pinned: boolean | number) => {
      const collection_position = toCollectionPosition(pinned);
      return match(item)
        .with(
          { model: "card" },
          { model: "dataset" },
          { model: "metric" },
          ({ id }) => updateCard({ id, collection_position }),
        )
        .with({ model: "dashboard" }, ({ id }) =>
          updateDashboard({ id, collection_position }),
        )
        .with({ model: "document" }, ({ id }) =>
          updateDocument({ id, collection_position }),
        )
        .exhaustive();
    },
    [updateCard, updateDashboard, updateDocument],
  );
}
