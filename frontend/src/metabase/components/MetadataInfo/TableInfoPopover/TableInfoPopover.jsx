import React from "react";
import PropTypes from "prop-types";

import TippyPopver from "metabase/components/Popover/TippyPopover";

import { WidthBoundTableInfo } from "./TableInfoPopover.styled";

export const POPOVER_DELAY = [1000, 300];

const propTypes = {
  tableId: PropTypes.number,
  children: PropTypes.node,
  placement: PropTypes.string,
};

function TableInfoPopover({ tableId, children, placement }) {
  return tableId != null ? (
    <TippyPopver
      interactive
      delay={POPOVER_DELAY}
      placement={placement || "left-start"}
      content={<WidthBoundTableInfo tableId={tableId} />}
    >
      {children}
    </TippyPopver>
  ) : (
    children
  );
}

TableInfoPopover.propTypes = propTypes;

export default TableInfoPopover;
