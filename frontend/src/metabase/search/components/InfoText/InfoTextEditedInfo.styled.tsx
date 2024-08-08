import { css } from "@emotion/react";
import styled from "@emotion/styled";

import LastEditInfoLabel from "metabase/components/LastEditInfoLabel";
import { color } from "metabase/lib/colors";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const LastEditedInfoText = styled(LastEditInfoLabel)`
  ${({ theme }) => {
    return css`
      color: ${theme.fn.themeColor("text-medium")};
      font-size: ${theme.fontSizes.sm};
      font-weight: 500;

      cursor: pointer;

      &:hover {
        color: ${theme.fn.themeColor("brand")};
      }
    `;
  }}
  ${breakpointMaxSmall} {
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
    max-width: 50%;
  }
`;

export const LastEditedInfoTooltip = styled(LastEditInfoLabel)`
  color: ${color("white")};
`;
