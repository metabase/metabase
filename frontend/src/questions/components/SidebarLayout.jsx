import React, { Component, PropTypes } from "react";

const SidebarLayout = ({ className, style, sidebar, children }) =>
    <div className={className} style={{ ...style, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        { React.cloneElement(
            sidebar,
            { style: { flexShrink: 0, overflowY: 'scroll' },
              className: 'scroll-show'
            },
            sidebar.props.children
        )}
        { children && React.cloneElement(
            React.Children.only(children),
            { style: { flex: 1, overflowY: 'scroll' }},
            React.Children.only(children).props.children
        )}
    </div>

export default SidebarLayout;
