import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ToggleRoot = styled.div`
  align-items: center;
  color: ${color("text-medium")};
  display: flex;
  margin-left: auto;
  padding-right: 4px;
  min-height: 3rem;
`;

interface ToggleContentProps {
  isReadOnly?: boolean;
}

export const ToggleContent = styled.a<ToggleContentProps>`
  display: ${props => (props.isReadOnly ? "none" : "flex")};
  color: ${color("text-medium")};
  font-size: 10px;
  font-weight: 700;
  text-decoration: none;
  text-transform: uppercase;
  align-items: center;
  margin-left: 1.5rem;
  margin-right: 1.5rem;
  transition: all 0.2s linear;

  &:hover {
    color: ${color("brand")};
  }
`;

export const ToggleText = styled.span`
  margin-right: ${space(1)};
  min-width: 70px;
`;
