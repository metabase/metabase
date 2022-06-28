import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";

export const AppBarRoot = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: ${APP_BAR_HEIGHT};
  padding: 0 1rem;
  border-bottom: 1px solid ${color("border")};
  background-color: ${color("bg-white")};
  z-index: 4;

  @media print {
    display: none;
  }
`;

export interface AppBarLeftContainerProps {
  isSearchActive?: boolean;
}

export const AppBarLeftContainer = styled.div<AppBarLeftContainerProps>`
  width: ${props => (props.isSearchActive ? "5rem" : "")};
`;
