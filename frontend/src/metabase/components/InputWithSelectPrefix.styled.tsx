import styled from "@emotion/styled";
import Input from "metabase/core/components/Input";
import InputBlurChange from "./InputBlurChange";

export const SelectPrefixInput = styled(InputBlurChange)`
  width: auto;

  ${Input.Field} {
    border: none;
    outline: none;
  }
`;
