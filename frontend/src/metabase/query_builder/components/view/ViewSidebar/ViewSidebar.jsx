import PropTypes from "prop-types";

import { ViewSidebarAside, ViewSidebarContent } from "./ViewSidebar.styled";

const ViewSidebar = ({ side = "right", width = 355, isOpen, children }) => (
  // If we passed `width` as prop, it would end up in the final HTML elements.
  // This would ruin the animation, so we pass it as `widthProp`.
  <ViewSidebarAside
    data-testid={`sidebar-${side}`}
    side={side}
    widthProp={width}
    isOpen={isOpen}
  >
    <ViewSidebarContent widthProp={width}>{children}</ViewSidebarContent>
  </ViewSidebarAside>
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
