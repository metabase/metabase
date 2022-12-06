import styled from "@emotion/styled";
import { display, space, hover, color } from "styled-system";
import { Link } from "react-router";
import { shouldForwardNonTransientProp } from "metabase/lib/styling/emotion";
import { focusOutlineStyle } from "metabase/core/style/input";

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

  ${focusOutlineStyle("brand")};
`;
