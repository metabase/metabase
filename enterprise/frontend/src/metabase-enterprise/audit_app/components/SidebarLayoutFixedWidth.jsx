/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";

import cx from "classnames";

// SidebarLayoutFixedWidth is similar to SidebarLayout but uses a fixed sidebar
// width, which is needed for our current Dashboard component to resize correctly

const SidebarLayoutFixedWidth = ({
  className,
  style,
  sidebar,
  sidebarWidth = 250,
  right = false,
  children,
}) => (
  <div className={cx("relative", className)} style={style}>
    {React.cloneElement(
      sidebar,
      {
        className: "Layout-sidebar absolute top left bottom",
        style: { width: sidebarWidth, ...(sidebar.props.style || {}) },
      },
      sidebar.props.children,
    )}
    {children &&
      React.cloneElement(
        React.Children.only(children),
        {
          style: {
            [right ? "marginRight" : "marginLeft"]: sidebarWidth,
            ...(React.Children.only(children).props.style || {}),
          },
        },
        React.Children.only(children).props.children,
      )}
  </div>
);

SidebarLayoutFixedWidth.propTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
  sidebar: PropTypes.element.isRequired,
  children: PropTypes.element.isRequired,
  sidebarWidth: PropTypes.number,
  right: PropTypes.bool,
};

export default SidebarLayoutFixedWidth;
