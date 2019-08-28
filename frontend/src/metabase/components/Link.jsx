import React from "react";
import { Link as ReactRouterLink } from "react-router";
import styled from "styled-components";
import { display, color, hover, space } from "styled-system";
import { stripLayoutProps } from "metabase/lib/utils";

const BaseLink = ({ to, className, children, ...props }) => (
  <ReactRouterLink
    to={to}
    className={className || "link"}
    {...stripLayoutProps(props)}
  >
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
