// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
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
