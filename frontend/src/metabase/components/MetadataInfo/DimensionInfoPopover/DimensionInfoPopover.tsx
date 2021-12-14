import React from "react";
import PropTypes from "prop-types";

import Dimension from "metabase-lib/lib/Dimension";
import TippyPopver, {
  ITippyPopoverProps,
} from "metabase/components/Popover/TippyPopover";
import { isCypressActive } from "metabase/env";

import { WidthBoundDimensionInfo } from "./DimensionInfoPopover.styled";

export const POPOVER_DELAY: [number, number] = [1000, 300];

const propTypes = {
  dimension: PropTypes.instanceOf(Dimension),
  children: PropTypes.node,
  placement: PropTypes.string,
};

type Props = { dimension: Dimension } & Pick<
  ITippyPopoverProps,
  "children" | "placement"
>;

function checkForMetadata(dimension: Dimension): boolean {
  const query = dimension?.query?.();
  if (dimension && query) {
    return query.isEditable();
  }

  return false;
}

function DimensionInfoPopover({ dimension, children, placement }: Props) {
  const hasMetadata = checkForMetadata(dimension);

  return hasMetadata ? (
    <TippyPopver
      delay={isCypressActive ? 0 : POPOVER_DELAY}
      interactive
      placement={placement || "left-start"}
      content={<WidthBoundDimensionInfo dimension={dimension} />}
    >
      {children}
    </TippyPopver>
  ) : (
    children
  );
}

DimensionInfoPopover.propTypes = propTypes;

export default DimensionInfoPopover;
