import { css } from "@emotion/react";
import styled from "@emotion/styled";

import SelectButton from "metabase/core/components/SelectButton";

export const StyledSelectButton = styled(SelectButton)`
  ${({ hasValue, theme }) =>
    hasValue &&
    css`
      color: ${theme.fn.themeColor("text-white")} !important;
      background-color: ${theme.fn.themeColor("brand")};
      border-color: ${theme.fn.themeColor("brand")};

      .Icon {
        color: ${theme.fn.themeColor("text-white")};
      }
    `};
`;
