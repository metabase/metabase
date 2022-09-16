import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";

export const ChartSettingNumericInput = styled(Input)`
  display: block;

  ${Input.Field} {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
  }
`;
