import React from "react";
import PropTypes from "prop-types";

import Dimension from "metabase-lib/lib/Dimension";
import TippyPopver, {
  ITippyPopoverProps,
} from "metabase/components/Popover/TippyPopover";
import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";

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
  return dimension ? (
    <TippyPopver
      delay={POPOVER_DELAY}
      interactive
      placement={placement || "left-start"}
      content={<DimensionInfo dimension={dimension} />}
    >
      {children}
    </TippyPopver>
  ) : (
    children
  );
}

DimensionInfoPopover.propTypes = propTypes;

export default DimensionInfoPopover;
