// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { LastEditInfoLabel } from "metabase/common/components/LastEditInfoLabel";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const LastEditedInfoText = styled(LastEditInfoLabel)`
  ${({ theme }) => {
    return css`
      color: var(--mb-color-text-secondary);
      font-size: ${theme.fontSizes.sm};
      font-weight: 500;

      cursor: pointer;

      &:hover {
        color: var(--mb-color-brand);
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
  color: var(--mb-color-tooltip-text);
`;
