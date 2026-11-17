import { useCallback, useMemo } from "react";

import { archiveAndTrack } from "metabase/archive/analytics";
import {
  type ArchivableItem,
  type ArchivableModel,
  useSetArchive,
} from "metabase/archive/hooks";
import { canArchiveItem } from "metabase/common/collections/utils";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

const ARCHIVABLE_MODELS: ReadonlySet<CollectionItemModel> = new Set([
  "card",
  "metric",
  "dataset",
  "snippet",
  "document",
  "dashboard",
  "collection",
  "exploration",
] satisfies Extract<CollectionItemModel, ArchivableModel>[]);

const isArchivableItem = (
  item: CollectionItem,
): item is CollectionItem & ArchivableItem => ARCHIVABLE_MODELS.has(item.model);

export const useBulkArchive = (
  selected: CollectionItem[],
  collection: Collection,
) => {
  const archive = useSetArchive();
  const archivableSelected = useMemo(
    () => selected.filter(isArchivableItem),
    [selected],
  );

  const canArchive = useMemo(
    () =>
      archivableSelected.length === selected.length &&
      archivableSelected.every((item) => canArchiveItem(item, collection)),
    [archivableSelected, selected.length, collection],
  );

  const archiveSelected = useCallback(
    () =>
      Promise.all(
        archivableSelected.map((item) =>
          archiveAndTrack({
            archive: async () => {
              await archive(item, true, { notify: false });
            },
            model: item.model,
            modelId: item.id,
            triggeredFrom: "collection",
          }),
        ),
      ),
    [archive, archivableSelected],
  );

  return { canArchive, archiveSelected };
};
