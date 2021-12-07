import cx from "classnames";
import React, { ReactNode } from "react";
import { Link as ReactRouterLink, LinkProps } from "react-router";
import styled from "styled-components";
import { color, display, hover, space } from "styled-system";
import Tooltip from "metabase/components/Tooltip";
import { stripLayoutProps } from "metabase/lib/utils";

interface Props extends LinkProps {
  to: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  tooltip?: string;
}

function BaseLink({
  to,
  className,
  children,
  disabled,
  tooltip,
  ...props
}: Props) {
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
