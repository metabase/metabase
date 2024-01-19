import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Group } from "metabase/ui";
import { ModalContentActionIcon } from "metabase/components/ModalContent";

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

export const EmbedModalHeaderBackIcon = styled(ModalContentActionIcon)`
  padding: 0;
`;
