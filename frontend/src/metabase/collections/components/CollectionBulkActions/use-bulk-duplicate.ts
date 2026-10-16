import { useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import {
  useCopyDashboardMutation,
  useCopyDocumentMutation,
} from "metabase/api";
import {
  canCopyItem,
  canonicalCollectionId,
} from "metabase/common/collections/utils";
import { useMetadataToasts } from "metabase/common/hooks";
import type { Collection, CollectionItem } from "metabase-types/api";

export const useBulkDuplicate = (
  selected: CollectionItem[],
  collection: Collection,
) => {
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [copyDashboard] = useCopyDashboardMutation();
  const [copyDocument] = useCopyDocumentMutation();

  const canDuplicate = useMemo(() => selected.every(canCopyItem), [selected]);

  const duplicateSelected = useCallback(async () => {
    const collectionId = canonicalCollectionId(collection.id);
    const itemsToCopy = selected.filter(canCopyItem);
    try {
      await Promise.all(
        itemsToCopy.map((item) => {
          const name = `${item.name} - ${t`Duplicate`}`;
          return match(item)
            .with({ model: "dashboard" }, ({ id }) =>
              copyDashboard({
                id,
                name,
                collection_id: collectionId,
                is_deep_copy: false,
              }).unwrap(),
            )
            .with({ model: "document" }, ({ id }) =>
              copyDocument({ id, name, collection_id: collectionId }).unwrap(),
            )
            .exhaustive();
        }),
      );
      sendSuccessToast(
        ngettext(
          msgid`${itemsToCopy.length} item has been duplicated.`,
          `${itemsToCopy.length} items have been duplicated.`,
          itemsToCopy.length,
        ),
      );
    } catch {
      sendErrorToast(t`There was an error duplicating these items.`);
    }
  }, [
    selected,
    collection.id,
    copyDashboard,
    copyDocument,
    sendSuccessToast,
    sendErrorToast,
  ]);

  return { canDuplicate, duplicateSelected };
};
