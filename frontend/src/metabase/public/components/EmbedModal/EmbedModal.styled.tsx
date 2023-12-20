import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Group } from "metabase/ui";

export const EmbedTitleContainer = styled(Group)<{
  onClick?: () => void;
}>`
  ${({ onClick, theme }) => {
    return (
      onClick &&
      css`
        &:hover * {
          color: ${theme.colors.brand[1]};
          cursor: pointer;
        }
      `
    );
  }}
`;
