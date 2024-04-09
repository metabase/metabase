/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { cloneElement, Children } from "react";

import CS from "metabase/css/core/index.css";

const SidebarLayout = ({ className, style, sidebar, children }) => (
  <div
    className={className}
    style={{ ...style, display: "flex", flexDirection: "row" }}
  >
    {cloneElement(
      sidebar,
      {
        style: { flexShrink: 0, alignSelf: "stretch" },
        className: cx(
          CS.scrollY,
          CS.scrollShow,
          CS.scrollLight,
          CS.scrollShowHover,
        ),
      },
      sidebar.props.children,
    )}
    {children &&
      cloneElement(
        Children.only(children),
        {
          style: {
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          },
        },
        Children.only(children).props.children,
      )}
  </div>
);

SidebarLayout.propTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
  sidebar: PropTypes.element.isRequired,
  children: PropTypes.element.isRequired,
};

export default SidebarLayout;
