import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";
import {
  inputPadding,
  inputTypography,
  numericInputReset,
} from "metabase/core/style/input";

export const ChartSettingNumericInput = styled(Input)`
  display: block;

  ${Input.Field} {
    width: 100%;
    ${inputPadding};
    ${inputTypography};
    ${numericInputReset};
  }
`;
