import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { FormSubmitButtonProps } from "metabase/forms";
import { FormSubmitButton } from "metabase/forms";
import { alpha } from "metabase/lib/colors";

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
