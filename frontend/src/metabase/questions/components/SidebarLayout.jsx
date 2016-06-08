/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

const SidebarLayout = ({ className, style, sidebar, children }) =>
    <div className={className} style={{ ...style, display: "flex", flexDirection: "row"}}>
        { React.cloneElement(
            sidebar,
            { style: { flexShrink: 0 },
              className: 'scroll-y scroll-show scroll--light scroll-show--hover'
            },
            sidebar.props.children
        )}
        { children && React.cloneElement(
            React.Children.only(children),
            { style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }},
            React.Children.only(children).props.children
        )}
    </div>

SidebarLayout.propTypes = {
    className:  PropTypes.string,
    style:      PropTypes.object,
    sidebar:    PropTypes.element.isRequired,
    children:   PropTypes.element.isRequired,
};

export default SidebarLayout;
