import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { FormSubmitButtonProps } from "metabase/forms";
import { FormSubmitButton } from "metabase/forms";

export const ResetAllFormSubmitButton = styled(FormSubmitButton, {
  shouldForwardProp: prop => prop !== "highlightOnHover",
})<FormSubmitButtonProps & { highlightOnHover?: boolean }>`
  ${({ highlightOnHover }) =>
    highlightOnHover
      ? css`
          :hover {
            background-color: color-mix(
              in srgb,
              var(--mb-color-error),
              transparent 85%
            );
          }
        `
      : ""}
`;
