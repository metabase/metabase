/* eslint-disable react/prop-types */
import React from "react";
import { t, msgid, ngettext } from "ttag";
import _ from "underscore";

import BulkActionBar from "metabase/components/BulkActionBar";
import Button from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";
import StackedCheckBox from "metabase/components/StackedCheckBox";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import {
  ActionBarContent,
  ActionBarText,
  ActionControlsRoot,
} from "./BulkActions.styled";

const BulkActionControls = ({ onArchive, onMove }) => (
  <ActionControlsRoot>
    <Button
      ml={1}
      medium
      disabled={!onArchive}
      onClick={onArchive}
      data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Archive Items`}
    >{t`Archive`}</Button>
    <Button
      ml={1}
      medium
      disabled={!onMove}
      onClick={onMove}
      data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Move Items`}
    >{t`Move`}</Button>
  </ActionControlsRoot>
);

const SelectionControls = ({
  selected,
  hasUnselected,
  onSelectAll,
  onSelectNone,
  size = 18,
}) =>
  !hasUnselected ? (
    <StackedCheckBox
      checked
      onChange={onSelectNone}
      size={size}
      aria-label="Select all items"
    />
  ) : selected.length === 0 ? (
    <StackedCheckBox
      onChange={onSelectAll}
      size={size}
      aria-label="Select all items"
    />
  ) : (
    <StackedCheckBox
      checked
      indeterminate
      onChange={onSelectAll}
      size={size}
      aria-label="Select all items"
    />
  );

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

  const canMove = selected.every(item => canMoveItem(item, collection));
  const canArchive = selected.every(item => canArchiveItem(item, collection));

  return (
    <BulkActionBar showing={selected.length > 0} isNavbarOpen={isNavbarOpen}>
      {/* NOTE: these padding and grid sizes must be carefully matched
                   to the main content above to ensure the bulk checkbox lines up */}
      <ActionBarContent>
        <SelectionControls {...props} />
        <BulkActionControls
          onArchive={canArchive ? onArchive : null}
          onMove={canMove ? onMoveStart : null}
        />
        <ActionBarText>
          {ngettext(
            msgid`${selected.length} item selected`,
            `${selected.length} items selected`,
            selected.length,
          )}
        </ActionBarText>
      </ActionBarContent>
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
    </BulkActionBar>
  );
}

export default React.memo(BulkActions);
