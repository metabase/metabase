/* eslint-disable react/prop-types */
import React from "react";
import { t, msgid, ngettext } from "ttag";
import _ from "underscore";

import { Motion, spring } from "react-motion";
import Modal from "metabase/components/Modal";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import {
  BulkActionsToast,
  CardButton,
  CardSide,
  ToastCard,
} from "./BulkActions.styled";

function BulkActions({
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
}) {
  const canMove = selected.every(item => canMoveItem(item, collection));
  const canArchive = selected.every(item => canArchiveItem(item, collection));
  const isVisible = selected.length > 0;

  return (
    <>
      <Motion
        defaultStyle={{
          opacity: 0,
          translateY: 100,
        }}
        style={{
          opacity: isVisible ? spring(1) : spring(0),
          translateY: isVisible ? spring(0) : spring(100),
        }}
      >
        {({ translateY }) => (
          <BulkActionsToast translateY={translateY} isNavbarOpen={isNavbarOpen}>
            <ToastCard dark>
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
                  data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Move Items`}
                >{t`Move`}</CardButton>
                <CardButton
                  medium
                  purple
                  disabled={!canArchive}
                  onClick={onArchive}
                  data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Archive Items`}
                >{t`Archive`}</CardButton>
              </CardSide>
            </ToastCard>
          </BulkActionsToast>
        )}
      </Motion>
      {!_.isEmpty(selectedItems) && selectedAction === "copy" && (
        <Modal onClose={onCloseModal}>
          <CollectionCopyEntityModal
            entityObject={selectedItems[0]}
            onClose={onCloseModal}
            onSaved={() => {
              onCloseModal();
              onCopy();
            }}
          />
        </Modal>
      )}
      {!_.isEmpty(selectedItems) && selectedAction === "move" && (
        <Modal onClose={onCloseModal}>
          <CollectionMoveModal
            title={
              selectedItems.length > 1
                ? t`Move ${selectedItems.length} items?`
                : t`Move "${selectedItems[0].getName()}"?`
            }
            onClose={onCloseModal}
            onMove={onMove}
          />
        </Modal>
      )}
    </>
  );
}

export default React.memo(BulkActions);
