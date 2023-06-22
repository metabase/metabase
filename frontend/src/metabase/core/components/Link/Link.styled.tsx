import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { Link } from "react-router";
import { color as metabaseColor } from "metabase/lib/colors";
import { shouldForwardNonTransientProp } from "metabase/lib/styling/emotion";
import { focusOutlineStyle } from "metabase/core/style/input";

import type { LinkProps } from "./types";

export const LinkRoot = styled(Link, {
  shouldForwardProp: shouldForwardNonTransientProp,
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
    color: ${metabaseColor("brand")};
    &:hover {
      text-decoration: underline;
    }
  `,
  brandBold: css`
    color: ${metabaseColor("brand")};
    font-weight: bold;
    &:hover {
      text-decoration: underline;
    }
  `,
};
