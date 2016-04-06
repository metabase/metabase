import React, { Component, PropTypes } from "react";

const SidebarLayout = ({ className, style, sidebar, content }) =>
    <div className={className} style={{ ...style, display: "flex", flexDirection: "row" }}>
        {
            React.cloneElement(sidebar, {}, sidebar.props.children)
        }
        {
            React.cloneElement(content, { style: { flex: "1" }}, content.props.children)
        }
    </div>

export default SidebarLayout;
