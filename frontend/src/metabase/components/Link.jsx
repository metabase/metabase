import React from "react";
import cx from "classnames";
import PropTypes from "prop-types";
import { Link as ReactRouterLink } from "react-router";
import styled from "styled-components";
import { display, color, hover, space } from "styled-system";

import { stripLayoutProps } from "metabase/lib/utils";
import Tooltip from "metabase/components/Tooltip";

BaseLink.propTypes = {
  to: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
  tooltip: PropTypes.string,
};

function BaseLink({ to, className, children, disabled, tooltip, ...props }) {
  const link = (
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

  return tooltip ? <Tooltip tooltip={tooltip}>{link}</Tooltip> : link;
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
