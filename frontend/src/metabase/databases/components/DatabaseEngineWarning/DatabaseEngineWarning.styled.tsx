import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface WarningRootProps {
  hasBorder?: boolean;
}

export const WarningRoot = styled.div<WarningRootProps>`
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
  padding: 1rem 0.75rem;
  color: ${color("text-medium")};
  border: 1px solid
    ${props => color(props.hasBorder ? "bg-medium" : "bg-light")};
  border-radius: 0.5rem;
  background-color: ${color("bg-light")};
`;

export const WarningLink = styled.a`
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;
`;
