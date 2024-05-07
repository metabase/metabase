import { memo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/components/BulkActionBar";
import Modal from "metabase/components/Modal";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import type { Collection, CollectionItem } from "metabase-types/api";

import type {
  OnArchive,
  OnCopyWithoutArguments,
  OnMoveWithOneItem,
} from "../types";

type CollectionBulkActionsProps = {
  selected: any[];
  collection: Collection;
  selectedItems: CollectionItem[] | null;
  selectedAction: string | null;
  onArchive?: OnArchive;
  onMoveStart: () => void;
  onCloseModal: () => void;
  onMove: OnMoveWithOneItem;
  onCopy: OnCopyWithoutArguments;
};

const CollectionBulkActions = ({
  selected,
  collection,
  selectedItems,
  selectedAction,
  onArchive,
  onMoveStart,
  onCloseModal,
  onMove,
  onCopy,
}: CollectionBulkActionsProps) => {
  const canMove = selected.every(item => canMoveItem(item, collection));
  const canArchive = selected.every(item => canArchiveItem(item, collection));
  const isVisible = selected.length > 0;

  const areSomeItemsSelected = !!selectedItems && !_.isEmpty(selectedItems);

  const actionMessage = ngettext(
    msgid`${selected.length} item selected`,
    `${selected.length} items selected`,
    selected.length,
  );

  return (
    <>
      <BulkActionBar message={actionMessage} opened={isVisible}>
        <BulkActionButton
          disabled={!canMove}
          onClick={onMoveStart}
        >{t`Move`}</BulkActionButton>
        <BulkActionButton
          disabled={!canArchive}
          onClick={() => {
            onArchive?.();
          }}
        >
          {t`Archive`}
        </BulkActionButton>
      </BulkActionBar>
      {areSomeItemsSelected && selectedAction === "copy" && (
        <Modal onClose={onCloseModal}>
          <CollectionCopyEntityModal
            entityObject={selectedItems[0]}
            onClose={onCloseModal}
            onSaved={() => {
              onCloseModal?.();
              onCopy?.();
            }}
          />
        </Modal>
      )}
      {areSomeItemsSelected && selectedAction === "move" && (
        <BulkMoveModal
          selectedItems={selectedItems}
          onClose={onCloseModal}
          onMove={onMove}
          initialCollectionId={collection.id}
        />
      )}
    </>
  );
};

// eslint-disable-next-line import/no-default-export
export default memo(CollectionBulkActions);
