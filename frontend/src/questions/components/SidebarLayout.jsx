import React, { Component, PropTypes } from "react";

const SidebarLayout = ({ className, style, sidebar, children }) => { console.log("children", children); return (
    <div className={className} style={{ ...style, display: "flex", flexDirection: "row" }}>
        { React.cloneElement(
            sidebar,
            {},
            sidebar.props.children
        )}
        { children && React.cloneElement(
            React.Children.only(children),
            { style: { flex: "1" }},
            React.Children.only(children).props.children
        )}
    </div>
)}
export default SidebarLayout;
