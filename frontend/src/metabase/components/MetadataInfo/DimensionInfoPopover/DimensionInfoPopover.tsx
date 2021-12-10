import React from "react";

import Dimension from "metabase-lib/lib/Dimension";
import TippyPopver from "metabase/components/Popover/TippyPopover";
import DimensionInfo from "metabase/components/MetadataInfo/DimensionInfo";
import { Placement } from "tippy.js";

export const POPOVER_DELAY: [number, number] = [1000, 300];

type Props = {
  dimension: Dimension;
  placement?: Placement;
  children: React.ReactElement;
};

const DimensionInfoPopover: React.FC<Props> = ({
  dimension,
  children,
  placement,
}) => {
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
};

export default DimensionInfoPopover;
