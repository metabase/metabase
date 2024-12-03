import cx from "classnames";
import PropTypes from "prop-types";

import { Box } from "metabase/ui";

import ViewSidebarS from "./ViewSidebar.module.css";

const ViewSidebar = ({ side = "right", width = 355, isOpen, children }) => (
  // If we passed `width` as prop, it would end up in the final HTML elements.
  // This would ruin the animation, so we pass it as `widthProp`.
  <Box
    className={cx(ViewSidebarS.ViewSidebarAside, {
      [ViewSidebarS.rightSide]: side === "right",
      [ViewSidebarS.leftSide]: side === "left",
      [ViewSidebarS.isOpen]: isOpen,
    })}
    component="aside"
    data-testid={`sidebar-${side}`}
    w={isOpen ? width : undefined}
    left={side === "left" ? 0 : undefined}
    right={side === "right" ? 0 : undefined}
  >
    <Box w={width} pos="absolute" h="100%">
      {children}
    </Box>
  </Box>
);

ViewSidebar.propTypes = {
  left: PropTypes.bool,
  right: PropTypes.bool,
  width: PropTypes.number,
  isOpen: PropTypes.bool,
  side: PropTypes.oneOf(["left", "right"]),
  children: PropTypes.node,
};

export default ViewSidebar;
