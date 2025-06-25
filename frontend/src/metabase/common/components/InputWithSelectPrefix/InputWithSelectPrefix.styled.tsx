// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Input from "metabase/common/components/Input";
import InputBlurChange from "metabase/components/InputBlurChange";

export const SelectPrefixInput = styled(InputBlurChange)`
  width: auto;

  ${Input.Field} {
    border: none;
    outline: none;
  }
`;
