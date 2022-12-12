import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";
import { inputPadding, inputTypography } from "metabase/core/style/input";

export const ChartSettingTextInput = styled(InputBlurChange)`
  ${InputBlurChange.Field} {
    ${inputPadding}
    ${inputTypography}
  }
`;
