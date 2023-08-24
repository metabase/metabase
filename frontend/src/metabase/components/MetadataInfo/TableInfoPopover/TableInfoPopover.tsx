import type { ReactElement } from "react";
import { hideAll } from "tippy.js";

import PropTypes from "prop-types";
import type { ITippyPopoverProps } from "metabase/components/Popover/TippyPopover";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";

import { WidthBoundTableInfo } from "./TableInfoPopover.styled";

export const POPOVER_DELAY: [number, number] = [500, 300];

interface TableSubset {
  id: number | string;
  description?: string;
}

const propTypes = {
  table: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    description: PropTypes.string,
  }).isRequired,
  children: PropTypes.node,
  placement: PropTypes.string,
  offset: PropTypes.arrayOf(PropTypes.number),
};

type Props = {
  table: TableSubset;
  children: ReactElement;
  placement: string;
  offset: number[];
} & Pick<ITippyPopoverProps, "children" | "placement" | "offset" | "delay">;

const className = "table-info-popover";

function isRealTable(id: number | string): id is number {
  return !isVirtualCardId(id);
}

function TableInfoPopover({
  table,
  children,
  placement,
  offset,
  delay = POPOVER_DELAY,
}: Props) {
  placement = placement || "left-start";

  const { id, description } = table;
  const hasDescription = !!description;
  const showPopover = hasDescription && isRealTable(id);

  return showPopover ? (
    <TippyPopover
      className={className}
      delay={delay}
      placement={placement}
      offset={offset}
      content={<WidthBoundTableInfo tableId={id} />}
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
    </TippyPopover>
  ) : (
    children
  );
}

TableInfoPopover.propTypes = propTypes;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TableInfoPopover;
