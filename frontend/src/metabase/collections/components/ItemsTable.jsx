import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Flex } from "grid-styled";

import { color } from "metabase/lib/colors";

import PinDropTarget from "metabase/containers/dnd/PinDropTarget";

import BaseItemsTable from "./BaseItemsTable";

function ItemsEmptyState() {
  return (
    <PinDropTarget pinIndex={null} hideUntilDrag margin={10}>
      {({ hovered }) => (
        <Flex
          align="center"
          justify="center"
          py={2}
          m={2}
          color={hovered ? color("brand") : color("text-medium")}
        >
          {t`Drag here to un-pin`}
        </Flex>
      )}
    </PinDropTarget>
  );
}

ItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function ItemsTable(props) {
  const { items } = props;

  if (items.length === 0) {
    return <ItemsEmptyState />;
  }

  return (
    <PinDropTarget pinIndex={null}>
      <BaseItemsTable {...props} />
    </PinDropTarget>
  );
}

export default ItemsTable;
