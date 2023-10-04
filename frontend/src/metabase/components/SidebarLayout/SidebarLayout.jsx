/* eslint "react/prop-types": "warn" */
import { cloneElement, Children } from "react";
import PropTypes from "prop-types";

const SidebarLayout = ({ className, style, sidebar, children }) => (
  <div
    className={className}
    style={{ ...style, display: "flex", flexDirection: "row" }}
  >
    {cloneElement(
      sidebar,
      {
        style: { flexShrink: 0, alignSelf: "stretch" },
        className: "scroll-y scroll-show scroll--light scroll-show--hover",
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
