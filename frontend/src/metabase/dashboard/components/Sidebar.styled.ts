import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

interface SidebarContainerProps {
  width: number;
}

export const SidebarContainer = styled.aside<SidebarContainerProps>`
  display: flex;
  flex-direction: column;
  background-color: ${color("white")};
  border-left: 1px solid ${color("border")};

  ${({ width }) =>
    width &&
    css`
      width: ${width}px;
      min-width: ${width}px;
    `};
`;
