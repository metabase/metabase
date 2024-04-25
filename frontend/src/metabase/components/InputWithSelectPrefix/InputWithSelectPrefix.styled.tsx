import styled from "@emotion/styled";

import InputBlurChange from "metabase/components/InputBlurChange";
import Input from "metabase/core/components/Input";

export const SelectPrefixInput = styled(InputBlurChange)`
  width: auto;

  ${Input.Field} {
    border: none;
    outline: none;
  }
`;
