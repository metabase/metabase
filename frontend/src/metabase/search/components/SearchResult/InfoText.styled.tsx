import { css } from "@emotion/react";
import styled from "@emotion/styled";
import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";

export const LastEditedInfo = styled(LastEditInfoLabel)`
  ${({ theme }) => {
    return css`
      color: ${theme.colors.text[1]};
      font-size: ${theme.fontSizes.sm};
      font-weight: 500;

      cursor: pointer;

      &:hover {
        color: ${theme.colors.brand[1]};
      }
    `;
  }}
`;
