import isPropValid from "@emotion/is-prop-valid";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link } from "react-router";

import { focusOutlineStyle } from "metabase/core/style/input";

import type { LinkProps } from "./types";

const isLinkPropValid = (propName: string) => {
  return isPropValid(propName) || propName === "activeClassName";
};

export const LinkRoot = styled(Link, {
  shouldForwardProp: isLinkPropValid,
})<LinkProps>`
  opacity: ${props => (props.disabled ? "0.4" : "")};
  pointer-events: ${props => (props.disabled ? "none" : "")};
  transition: opacity 0.3s linear;

  ${focusOutlineStyle("brand")};

  ${props => variants[props.variant ?? "default"] ?? ""}
`;

export const variants = {
  default: "",
  brand: css`
    color: var(--mb-color-brand);
    &:hover {
      text-decoration: underline;
    }
  `,
  brandBold: css`
    color: var(--mb-color-brand);
    font-weight: bold;
    &:hover {
      text-decoration: underline;
    }
  `,
};
