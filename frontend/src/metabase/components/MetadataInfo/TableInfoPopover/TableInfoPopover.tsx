import React from "react";
import PropTypes from "prop-types";

import TippyPopver, {
  ITippyPopoverProps,
} from "metabase/components/Popover/TippyPopover";

import { WidthBoundTableInfo } from "./TableInfoPopover.styled";

export const POPOVER_DELAY: [number, number] = [500, 300];

const propTypes = {
  tableId: PropTypes.number.isRequired,
  children: PropTypes.node,
  placement: PropTypes.string,
};

type Props = { tableId: number } & Pick<
  ITippyPopoverProps,
  "children" | "placement"
>;

function TableInfoPopover({ tableId, children, placement }: Props) {
  placement = placement || "left-start";

  return tableId != null ? (
    <TippyPopver
      interactive
      delay={POPOVER_DELAY}
      placement={placement}
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
