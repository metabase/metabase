import { useCallback, useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  useCopyDashboardMutation,
  useCopyDocumentMutation,
} from "metabase/api";
import {
  canCopyItem,
  canonicalCollectionId,
} from "metabase/common/collections/utils";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type { Collection, CollectionItem } from "metabase-types/api";

export const useBulkDuplicate = (
  selected: CollectionItem[],
  collection: Collection,
) => {
  const dispatch = useDispatch();
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
          if (item.model === "dashboard") {
            return copyDashboard({
              id: item.id,
              name,
              collection_id: collectionId,
              is_deep_copy: false,
            }).unwrap();
          }
          return copyDocument({
            id: item.id,
            name,
            collection_id: collectionId,
          }).unwrap();
        }),
      );
      dispatch(
        addUndo({
          message: ngettext(
            msgid`${itemsToCopy.length} item has been duplicated.`,
            `${itemsToCopy.length} items have been duplicated.`,
            itemsToCopy.length,
          ),
          canDismiss: true,
        }),
      );
    } catch {
      dispatch(
        addUndo({ message: t`There was an error duplicating these items.` }),
      );
    }
  }, [selected, collection.id, copyDashboard, copyDocument, dispatch]);

  return { canDuplicate, duplicateSelected };
};
