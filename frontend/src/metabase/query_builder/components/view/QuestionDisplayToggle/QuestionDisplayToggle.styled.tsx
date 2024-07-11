import styled from "@emotion/styled";

import { color, darken } from "metabase/lib/colors";

export const Well = styled.div`
  display: flex;
  align-items: center;
  padding: 4px 6px;
  border-radius: 99px;
  background-color: ${color("bg-medium")};

  &:hover {
    background-color: ${darken(color("bg-medium"), 0.05)};
  }

  transition: background 300ms linear;
`;

interface ToggleIconProps {
  active?: boolean;
}

export const ToggleIcon = styled.div<ToggleIconProps>`
  display: flex;
  padding: 4px 8px;
  cursor: pointer;
  background-color: ${props => (props.active ? color("brand") : "transparent")};
  color: ${props => (props.active ? "white" : "inherit")};
  border-radius: 99px;
`;
