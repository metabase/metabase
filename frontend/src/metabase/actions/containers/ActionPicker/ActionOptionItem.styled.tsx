import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

interface ActionOptionProps {
  isSelected?: boolean;
  hasDescription?: boolean;
}

export const ActionOptionListItem = styled.div<ActionOptionProps>`
  color: ${props =>
    props.isSelected ? color("text-white") : color("text-normal")};
  background-color: ${props =>
    props.isSelected ? color("brand") : color("white")};
  cursor: pointer;
  display: flex;
  align-items: ${props => (props.hasDescription ? "flex-start" : "center")};
  gap: ${space(1)};
  border: 1px solid ${color("border")};
  border-radius: ${space(1)};
  padding: ${space(2)};
  margin: ${space(1)} ${space(0)};

  &:hover {
    background-color: ${lighten("brand", 0.1)};
    color: ${color("text-white")};
  }
`;

export const ActionOptionTitle = styled.div`
  font-size: 0.875rem;
  font-weight: bold;
`;

export const ActionOptionDescription = styled.div`
  font-size: 0.875rem;
  margin-top: ${space(1)};
`;
