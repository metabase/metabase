import styled from "@emotion/styled";
import { display, space, hover, color } from "styled-system";
import { Link } from "react-router";
import { color as colors } from "metabase/lib/colors";
import { shouldForwardNonTransientProp } from "metabase/lib/styling/emotion";

export const LinkRoot = styled(Link, {
  shouldForwardProp: shouldForwardNonTransientProp,
})`
  ${display};
  ${space};
  ${hover};
  ${color};

  opacity: ${props => (props.disabled ? "0.4" : "")};
  pointer-events: ${props => (props.disabled ? "none" : "")};
  transition: opacity 0.3s linear;

  &:focus {
    outline: 2px solid ${() => colors("focus")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
