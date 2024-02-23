import { css } from "@emotion/react";
import styled from "@emotion/styled";
import AutosizeTextarea from "react-textarea-autosize";

import { color } from "metabase/lib/colors";

export interface TextPickerInputProps {
  hasInvalidValues: boolean;
}

export const TextPickerInput = styled.input<TextPickerInputProps>`
  border-color: ${color("filter")};

  ${({ hasInvalidValues }) =>
    hasInvalidValues &&
    css`
      border-color: ${color("error")};
    `}
`;

export interface TextPickerAreaProps {
  hasInvalidValues: boolean;
}

export const TextPickerArea = styled(AutosizeTextarea)<TextPickerAreaProps>`
  border-color: ${color("filter")};

  ${({ hasInvalidValues }) =>
    hasInvalidValues &&
    css`
      border-color: ${color("error")};
    `}
`;
