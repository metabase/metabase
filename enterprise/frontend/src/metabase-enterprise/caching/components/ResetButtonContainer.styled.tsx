import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { FormSubmitButtonProps } from "metabase/forms";
import { FormSubmitButton } from "metabase/forms";
import { alpha } from "metabase/lib/colors";
import { Text, type TextProps } from "metabase/ui";

export const ResetAllFormSubmitButton = styled(FormSubmitButton, {
  shouldForwardProp: prop => prop !== "highlightOnHover",
})<FormSubmitButtonProps & { highlightOnHover?: boolean }>`
  ${({ highlightOnHover, theme }) =>
    highlightOnHover
      ? css`
          :hover {
            background-color: ${alpha(theme.fn.themeColor("error"), 0.15)};
          }
        `
      : ""}
`;

export const ResetAllFormSubmitButtonLabel = styled(Text)<TextProps>`
  /* Prevents the label from getting cut off vertically */
  height: 1rem;
`;
