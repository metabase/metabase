import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export interface DashCardRootProps {
  isNightMode: boolean;
}

export const DashCardRoot = styled.div<DashCardRootProps>`
  background-color: ${color("white")};

  ${({ isNightMode }) =>
    isNightMode &&
    css`
      border-color: ${color("bg-night")};
      background-color: ${color("bg-night")};
    `}
`;
