import React from "react";
import cx from "classnames";
import PropTypes from "prop-types";
import { Link as ReactRouterLink } from "react-router";
import styled from "styled-components";
import { display, color, hover, space } from "styled-system";
import { stripLayoutProps } from "metabase/lib/utils";

BaseLink.propTypes = {
  to: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};

function BaseLink({ to, className, children, disabled, ...props }) {
  return (
    <ReactRouterLink
      to={to}
      className={cx(className || "link", {
        disabled: disabled,
        "text-light": disabled,
      })}
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

  transition: color 0.3s linear;
  transition: opacity 0.3s linear;
`;

export default Link;
