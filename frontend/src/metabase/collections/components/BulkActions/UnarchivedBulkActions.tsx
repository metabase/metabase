import { useMemo } from "react";
import { t } from "ttag";

import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import type { Collection, CollectionItem } from "metabase-types/api";

import { CardButton } from "./BulkActions.styled";

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
    const actions = selected.map(item => item.setArchived(true));
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
      <CardButton
        medium
        purple
        disabled={!canMove}
        onClick={handleBulkMoveStart}
      >{t`Move`}</CardButton>
      <CardButton
        medium
        purple
        disabled={!canArchive}
        onClick={handleBulkArchive}
      >{t`Move to trash`}</CardButton>
    </>
  );
};
