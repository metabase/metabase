import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface DashCardRootProps {
  isNightMode: boolean;
}

export const DashCardRoot = styled.div<DashCardRootProps>`
  border-color: ${props => props.isNightMode && color("bg-night")};
  background-color: ${props => props.isNightMode && color("bg-night")};
`;
