import styled from "styled-components";
import { color } from "metabase/lib/colors";

export interface WarningRootProps {
  hasBorder?: boolean;
}

export const WarningRoot = styled.div<WarningRootProps>`
  margin-bottom: 2rem;
  padding: 1rem 0.75rem;
  color: ${color("text-medium")};
  border: 1px solid
    ${props => color(props.hasBorder ? "bg-medium" : "bg-light")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
`;

export const WarningLink = styled.span`
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;
`;
