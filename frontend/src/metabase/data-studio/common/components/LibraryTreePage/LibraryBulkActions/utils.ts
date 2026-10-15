import { match } from "ts-pattern";

import type { ArchivableItem } from "metabase/archive/hooks";
import type { MovableItem } from "metabase/common/hooks";
import type { SelectedItem } from "metabase/data-studio/common/hooks/use-library-bulk-selection";

// Snippet-section folders map to `snippet-collection`; all others to `collection`.
export function selectedItemToMovable(item: SelectedItem): MovableItem {
  const { entityId: id } = item;
  return match<SelectedItem, MovableItem>(item)
    .with({ model: "table" }, () => ({ model: "table", id }))
    .with({ model: "metric" }, () => ({ model: "metric", id }))
    .with({ model: "dashboard" }, () => ({ model: "dashboard", id }))
    .with({ model: "snippet" }, () => ({ model: "snippet", id }))
    .with({ model: "action" }, () => ({ model: "action", id }))
    .with({ model: "collection", section: "snippets" }, () => ({
      model: "snippet-collection",
      id,
    }))
    .with({ model: "collection" }, () => ({ model: "collection", id }))
    .exhaustive();
}

export function selectedItemToArchivable(item: SelectedItem): ArchivableItem {
  const { entityId: id, canWrite } = item;
  return match<SelectedItem, ArchivableItem>(item)
    .with({ model: "metric" }, () => ({
      model: "metric",
      id,
      can_write: canWrite,
    }))
    .with({ model: "dashboard" }, () => ({
      model: "dashboard",
      id,
      can_write: canWrite,
    }))
    .with({ model: "snippet" }, () => ({
      model: "snippet",
      id,
      can_write: canWrite,
    }))
    .with({ model: "action" }, () => ({
      model: "action",
      id,
      can_write: canWrite,
    }))
    .with({ model: "collection", section: "snippets" }, () => ({
      model: "snippet-collection",
      id,
      can_write: canWrite,
    }))
    .with({ model: "collection" }, () => ({
      model: "collection",
      id,
      can_write: canWrite,
    }))
    .with({ model: "table" }, () => {
      throw new Error("Tables are unpublished, not moved to the trash");
    })
    .exhaustive();
}

export async function runLibraryItemUpdates(
  items: SelectedItem[],
  applyToItem: (item: SelectedItem) => Promise<unknown>,
): Promise<number> {
  const results = await Promise.allSettled(items.map(applyToItem));
  return results.filter((result) => result.status === "rejected").length;
}
