import styled from "styled-components";
import { Link } from "react-router";
import { color, display, hover, space } from "styled-system";

export const LinkRoot = styled(Link)`
  ${display}
  ${space}
  ${hover}
  ${color}

  opacity: ${props => (props.disabled ? "0.4" : "")};
  pointer-events: ${props => (props.disabled ? "none" : "")};
  transition: opacity 0.3s linear;

  &:focus {
    outline: 2px solid ${color("focus")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
