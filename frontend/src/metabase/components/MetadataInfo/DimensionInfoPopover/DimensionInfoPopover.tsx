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

function DimensionInfoPopover({ dimension, children, placement }: Props) {
  // avoid a scenario where we may have a Dimension instance but not enough metadata
  // to even show a display name (probably indicative of a bug)
  const hasMetadata = !!(dimension && dimension.displayName());

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
