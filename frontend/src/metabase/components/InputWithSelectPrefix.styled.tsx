import styled from "@emotion/styled";
import InputBlurChange from "./InputBlurChange";

export const SelectPrefixInput = styled(InputBlurChange)`
  flex: 1 0 auto;

  ${InputBlurChange.Field} {
    border: none;
  }
`;
