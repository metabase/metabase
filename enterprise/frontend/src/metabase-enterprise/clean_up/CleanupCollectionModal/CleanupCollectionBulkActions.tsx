import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/components/BulkActionBar";
import type { CollectionItem } from "metabase-types/api";

import CS from "./CleanupCollectionBulkActions.module.css";

interface CleanupCollectionBulkActionsProps {
  selected: CollectionItem[];
  clearSelectedItem: () => void;
}

export const CleanupCollectionBulkActions = ({
  selected,
  clearSelectedItem,
}: CleanupCollectionBulkActionsProps) => {
  const actionMessage = ngettext(
    msgid`${selected.length} item selected`,
    `${selected.length} items selected`,
    selected.length,
  );

  const handleBulkArchive = async () => {
    const actions = selected.map(item => item?.setArchived?.(true));
    Promise.all(actions).finally(() => clearSelectedItem());
  };

  return (
    <BulkActionBar
      className={CS.container}
      message={actionMessage}
      opened={selected.length > 0}
    >
      <BulkActionButton
        disabled={false}
        onClick={handleBulkArchive}
      >{t`Move to trash`}</BulkActionButton>
    </BulkActionBar>
  );
};
