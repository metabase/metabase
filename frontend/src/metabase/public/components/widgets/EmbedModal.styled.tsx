import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Group } from "metabase/ui";

export const EmbedTitleContainer = styled(Group)<{
  isActive?: boolean;
}>`
  ${({ isActive, theme }) => {
    return (
      isActive &&
      css`
        &:hover * {
          color: ${theme.colors.brand[1]};
          cursor: pointer;
        }
      `
    );
  }}
`;
