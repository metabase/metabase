import React from "react";
import PropTypes from "prop-types";

import TippyPopver from "metabase/components/Popover/TippyPopover";
import TableInfo from "metabase/components/MetadataInfo/TableInfo";

export const POPOVER_DELAY = [1000, 300];

const propTypes = {
  tableId: PropTypes.number,
  children: PropTypes.node,
  placement: PropTypes.string,
};

function TableInfoPopover({ tableId, children, placement }) {
  return tableId != null ? (
    <TippyPopver
      delay={POPOVER_DELAY}
      placement={placement || "left-start"}
      content={<TableInfo tableId={tableId} />}
    >
      {children}
    </TippyPopver>
  ) : (
    children
  );
}

TableInfoPopover.propTypes = propTypes;

export default TableInfoPopover;
