import React from "react";
import PropTypes from "prop-types";
import { Link as ReactRouterLink } from "react-router";
import styled from "styled-components";
import { display, color, hover, space } from "styled-system";
import { stripLayoutProps } from "metabase/lib/utils";

BaseLink.propTypes = {
  to: PropTypes.string.isRequired,
  className: PropTypes.string,
  children: PropTypes.node,
};

function BaseLink({ to, className, children, ...props }) {
  return (
    <ReactRouterLink
      to={to}
      className={className || "link"}
      {...stripLayoutProps(props)}
    >
      {children}
    </ReactRouterLink>
  );
}

const Link = styled(BaseLink)`
  ${display}
  ${space}
  ${hover}
  ${color}
`;

export default Link;
