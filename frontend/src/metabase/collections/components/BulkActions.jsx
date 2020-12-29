import React from "react";
import { Box, Flex } from "grid-styled";
import { t, msgid, ngettext } from "ttag";
import _ from "underscore";

import { Grid, GridItem } from "metabase/components/Grid";
import BulkActionBar from "metabase/components/BulkActionBar";
import Button from "metabase/components/Button";
import StackedCheckBox from "metabase/components/StackedCheckBox";

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
  deselected,
  onSelectAll,
  onSelectNone,
  size = 18,
}) =>
  deselected.length === 0 ? (
    <StackedCheckBox checked onChange={onSelectNone} size={size} />
  ) : selected.length === 0 ? (
    <StackedCheckBox onChange={onSelectAll} size={size} />
  ) : (
    <StackedCheckBox checked indeterminate onChange={onSelectAll} size={size} />
  );

export default function BulkActions(props) {
  const { selected, handleBulkArchive, handleBulkMoveStart } = props;
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
                  _.all(selected, item => item.setArchived)
                    ? handleBulkArchive
                    : null
                }
                onMove={
                  _.all(selected, item => item.setCollection)
                    ? handleBulkMoveStart
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
    </BulkActionBar>
  );
}
