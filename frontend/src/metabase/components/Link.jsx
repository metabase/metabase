import React from "react";
import { Link as ReactRouterLink } from "react-router";
import styled from "styled-components";
import { display, color, hover, space } from "styled-system";

const BaseLink = ({ to, className, children, ...props }) => (
  <ReactRouterLink to={to} className={className || "link"} {...props}>
    {children}
  </ReactRouterLink>
);

const Link = styled(BaseLink)`
  ${display}
  ${space}
  ${hover}
  ${color}
`;

export default Link;
