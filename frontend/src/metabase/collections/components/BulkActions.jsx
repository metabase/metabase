/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";
import { t, msgid, ngettext } from "ttag";
import _ from "underscore";

import { Grid, GridItem } from "metabase/components/Grid";
import BulkActionBar from "metabase/components/BulkActionBar";
import Button from "metabase/components/Button";
import Modal from "metabase/components/Modal";
import StackedCheckBox from "metabase/components/StackedCheckBox";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

const BulkActionControls = ({ onArchive, onMove }) => (
  <Box ml={1}>
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
  </Box>
);

const SelectionControls = ({
  selected,
  hasUnselected,
  onSelectAll,
  onSelectNone,
  size = 18,
}) =>
  !hasUnselected ? (
    <StackedCheckBox checked onChange={onSelectNone} size={size} />
  ) : selected.length === 0 ? (
    <StackedCheckBox onChange={onSelectAll} size={size} />
  ) : (
    <StackedCheckBox checked indeterminate onChange={onSelectAll} size={size} />
  );

function BulkActions(props) {
  const {
    selected,
    selectedItems,
    selectedAction,
    onArchive,
    onMoveStart,
    onCloseModal,
    onMove,
    onCopy,
  } = props;
  return (
    <BulkActionBar showing={selected.length > 0}>
      {/* NOTE: these padding and grid sizes must be carefully matched
                   to the main content above to ensure the bulk checkbox lines up */}
      <Box px={[2, 4]} py={1}>
        <Grid>
          <GridItem w={[1, 1 / 3]} />
          <GridItem w={[1, 2 / 3]} px={[1, 2]}>
            <Flex align="center" justify="center" px={2}>
              <SelectionControls {...props} />
              <BulkActionControls
                onArchive={
                  _.all(selected, item => item.setArchived) ? onArchive : null
                }
                onMove={
                  _.all(selected, item => item.setCollection)
                    ? onMoveStart
                    : null
                }
              />
              <Box ml="auto">
                {ngettext(
                  msgid`${selected.length} item selected`,
                  `${selected.length} items selected`,
                  selected.length,
                )}
              </Box>
            </Flex>
          </GridItem>
        </Grid>
      </Box>
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
