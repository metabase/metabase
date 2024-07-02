import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Textarea } from "metabase/ui";

export interface TextPickerInputProps {
  hasInvalidValues: boolean;
}

export const TextPickerInput = styled.input<TextPickerInputProps>`
  border-color: var(--mb-color-filter);

  ${({ hasInvalidValues }) =>
    hasInvalidValues &&
    css`
      border-color: var(--mb-color-error);
    `}
`;

export interface TextPickerAreaProps {
  hasInvalidValues: boolean;
}

export const TextPickerArea = styled(Textarea)<TextPickerAreaProps>`
  border-color: var(--mb-color-filter);

  ${({ hasInvalidValues }) =>
    hasInvalidValues &&
    css`
      border-color: var(--mb-color-error);
    `}
`;
