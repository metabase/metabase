import styled from "styled-components";
import { display, space, hover, color } from "styled-system";
import { Link } from "react-router";
import { color as colors } from "metabase/lib/colors";

export const LinkRoot = styled(Link)`
  ${display};
  ${space};
  ${hover};
  ${color};

  opacity: ${props => (props.disabled ? "0.4" : "")};
  pointer-events: ${props => (props.disabled ? "none" : "")};
  transition: opacity 0.3s linear;

  &:focus {
    outline: 2px solid ${colors("focus")};
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`;
