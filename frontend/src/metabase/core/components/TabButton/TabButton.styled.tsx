import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface TabButtonProps {
  isSelected?: boolean;
}

export const TabButtonLabel = styled.div`
  width: 100%;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const TabButtonRoot = styled.button<TabButtonProps>`
  padding: 1rem 0;

  color: ${props => (props.isSelected ? color("brand") : color("text-dark"))};
  font-size: 0.875rem;
  font-weight: 700;

  cursor: pointer;

  border-bottom: 3px solid
    ${props => (props.isSelected ? color("brand") : "transparent")};
`;
