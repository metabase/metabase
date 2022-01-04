import React from "react";
import PropTypes from "prop-types";
import { hideAll } from "tippy.js";

import TippyPopver, {
  ITippyPopoverProps,
} from "metabase/components/Popover/TippyPopover";

import { WidthBoundTableInfo } from "./TableInfoPopover.styled";

export const POPOVER_DELAY: [number, number] = [500, 300];

const propTypes = {
  tableId: PropTypes.number.isRequired,
  children: PropTypes.node,
  placement: PropTypes.string,
  offset: PropTypes.arrayOf(PropTypes.number),
};

type Props = { tableId: number } & Pick<
  ITippyPopoverProps,
  "children" | "placement" | "offset"
>;

const className = "table-info-popover";

function TableInfoPopover({ tableId, children, placement, offset }: Props) {
  placement = placement || "left-start";

  return tableId != null ? (
    <TippyPopver
      className={className}
      interactive
      delay={POPOVER_DELAY}
      placement={placement}
      offset={offset}
      content={<WidthBoundTableInfo tableId={tableId} />}
      onTrigger={instance => {
        const dimensionInfoPopovers = document.querySelectorAll(
          `.${className}[data-state~='visible']`,
        );

        // if a dimension info popover is already visible, hide it and show this one immediately
        if (dimensionInfoPopovers.length > 0) {
          hideAll({
            exclude: instance,
          });
          instance.show();
        }
      }}
    >
      {children}
    </TippyPopver>
  ) : (
    children
  );
}

TableInfoPopover.propTypes = propTypes;

export default TableInfoPopover;
