/* eslint-disable react/prop-types */
import { memo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import Modal from "metabase/components/Modal";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import { Transition } from "metabase/ui";

import type { Collection, CollectionItem } from "metabase-types/api";
import type {
  OnArchive,
  OnCopyWithoutArguments,
  OnMoveWithOneItem,
} from "../types";
import {
  BulkActionsToast,
  CardButton,
  CardSide,
  ToastCard,
} from "./BulkActions.styled";

const slideIn = {
  in: { opacity: 1, transform: "translate(-50%, 0)" },
  out: { opacity: 0, transform: "translate(-50%, 100px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

type BulkActionsProps = {
  selected: any[];
  collection: Collection;
  selectedItems: CollectionItem[] | null;
  selectedAction: string | null;
  onArchive?: OnArchive;
  onMoveStart: () => void;
  onCloseModal: () => void;
  onMove: OnMoveWithOneItem;
  onCopy: OnCopyWithoutArguments;
  isNavbarOpen: boolean;
};

const BulkActions = ({
  selected,
  collection,
  selectedItems,
  selectedAction,
  onArchive,
  onMoveStart,
  onCloseModal,
  onMove,
  onCopy,
  isNavbarOpen,
}: BulkActionsProps) => {
  const canMove = selected.every(item => canMoveItem(item, collection));
  const canArchive = selected.every(item => canArchiveItem(item, collection));
  const isVisible = selected.length > 0;

  return (
    <>
      <Transition
        mounted={isVisible}
        transition={slideIn}
        duration={400}
        timingFunction="ease"
      >
        {styles => (
          <BulkActionsToast style={styles} isNavbarOpen={isNavbarOpen}>
            <ToastCard dark data-testid="toast-card">
              <CardSide>
                {ngettext(
                  msgid`${selected.length} item selected`,
                  `${selected.length} items selected`,
                  selected.length,
                )}
              </CardSide>
              <CardSide>
                <CardButton
                  medium
                  purple
                  disabled={!canMove}
                  onClick={onMoveStart}
                >{t`Move`}</CardButton>
                <CardButton
                  medium
                  purple
                  disabled={!canArchive}
                  onClick={() => {
                    onArchive?.();
                  }}
                >{t`Archive`}</CardButton>
              </CardSide>
            </ToastCard>
          </BulkActionsToast>
        )}
      </Transition>
      {!!selectedItems &&
        !_.isEmpty(selectedItems) &&
        selectedAction === "copy" && (
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
      {!!selectedItems &&
        !_.isEmpty(selectedItems) &&
        selectedAction === "move" && (
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

export default memo(BulkActions);
