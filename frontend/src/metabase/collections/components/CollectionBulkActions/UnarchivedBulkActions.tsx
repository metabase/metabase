import { useMemo } from "react";
import { t } from "ttag";

import { archiveAndTrack } from "metabase/archive/analytics";
import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import { BulkActionButton } from "metabase/components/BulkActionBar";
import type { Collection, CollectionItem } from "metabase-types/api";

type UnarchivedBulkActionsProps = {
  selected: any[];
  collection: Collection;
  clearSelected: () => void;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  setSelectedAction: (action: string) => void;
};

export const UnarchivedBulkActions = ({
  selected,
  collection,
  clearSelected,
  setSelectedItems,
  setSelectedAction,
}: UnarchivedBulkActionsProps) => {
  // archive
  const canArchive = useMemo(() => {
    return selected.every(item => canArchiveItem(item, collection));
  }, [selected, collection]);

  const handleBulkArchive = async () => {
    const actions = selected.map(item => {
      return archiveAndTrack({
        archive: () =>
          item.setArchived
            ? item.setArchived(true, { notify: false })
            : Promise.resolve(),
        model: item.model,
        modelId: item.id,
        triggeredFrom: "collection",
      });
    });

    Promise.all(actions).finally(() => clearSelected());
  };

  // move
  const canMove = useMemo(() => {
    return selected.every(item => canMoveItem(item, collection));
  }, [selected, collection]);

  const handleBulkMoveStart = () => {
    setSelectedItems(selected);
    setSelectedAction("move");
  };

  return (
    <>
      <BulkActionButton
        disabled={!canMove}
        onClick={handleBulkMoveStart}
      >{t`Move`}</BulkActionButton>
      <BulkActionButton
        disabled={!canArchive}
        onClick={handleBulkArchive}
      >{t`Move to trash`}</BulkActionButton>
    </>
  );
};
