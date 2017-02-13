import React from "react";
import { Link as ReactRouterLink } from "react-router";

const Link = ({ to, className, children, ...props }) =>
    <ReactRouterLink
        to={to}
        className={className || "link"}
        {...props}
    >
        {children}
    </ReactRouterLink>

export default Link;
