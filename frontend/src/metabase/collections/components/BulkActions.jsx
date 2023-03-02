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
import { NAV_SIDEBAR_WIDTH_HALF } from "metabase/nav/constants";
import {
  BulkActionsToast,
  CardButton,
  CardSide,
  ToastCard,
} from "./BulkActions.styled";

function BulkActions(props) {
  const {
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
  } = props;

  const onMoveClick = selected.every(item => canMoveItem(item, collection))
    ? onMoveStart
    : null;
  const onArchiveClick = selected.every(item =>
    canArchiveItem(item, collection),
  )
    ? onArchive
    : null;

  const showing = selected.length > 0;

  return (
    <>
      {/* NOTE: these padding and grid sizes must be carefully matched
      to the main content above to ensure the bulk checkbox lines up */}
      <Motion
        defaultStyle={{
          opacity: 0,
          translateY: 100,
        }}
        style={{
          opacity: showing ? spring(1) : spring(0),
          translateY: showing ? spring(0) : spring(100),
        }}
      >
        {({ translateY }) => (
          <BulkActionsToast
            style={{
              transform: `translate(-50%, ${translateY}px)`,
              marginLeft: isNavbarOpen ? NAV_SIDEBAR_WIDTH_HALF : 0,
            }}
          >
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
                  disabled={!onMoveClick}
                  onClick={onMoveClick}
                  data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Move Items`}
                >{t`Move`}</CardButton>
                <CardButton
                  medium
                  purple
                  disabled={!onArchiveClick}
                  onClick={onArchiveClick}
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
