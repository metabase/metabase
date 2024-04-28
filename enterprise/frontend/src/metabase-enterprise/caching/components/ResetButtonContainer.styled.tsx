import styled from "@emotion/styled";

import type { FormSubmitButtonProps } from "metabase/forms";
import { FormSubmitButton } from "metabase/forms";
import { alpha } from "metabase/lib/colors";

export const ResetAllFormSubmitButton = styled(FormSubmitButton, {
  shouldForwardProp: prop => prop !== "highlightOnHover",
})<FormSubmitButtonProps & { highlightOnHover?: boolean }>`
  ${({ highlightOnHover }) =>
    highlightOnHover
      ? `:hover { background-color: ${alpha("error", 0.15)}; }`
      : ""}
`;
