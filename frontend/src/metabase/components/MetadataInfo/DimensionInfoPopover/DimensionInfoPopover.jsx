import React from "react";
import PropTypes from "prop-types";

import Dimension from "metabase-lib/lib/Dimension";
import TippyPopver from "metabase/components/Popover/TippyPopover";
import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";

export const POPOVER_DELAY = [1000, 300];

const propTypes = {
  dimension: PropTypes.instanceOf(Dimension),
  children: PropTypes.node,
  placement: PropTypes.string,
};

function DimensionInfoPopover({ dimension, children, placement }) {
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
