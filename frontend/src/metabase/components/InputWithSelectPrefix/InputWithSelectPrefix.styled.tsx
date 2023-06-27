import { styled } from "metabase/ui/utils";
import Input from "metabase/core/components/Input";
import InputBlurChange from "metabase/components/InputBlurChange";

export const SelectPrefixInput = styled(InputBlurChange)`
  width: auto;

  ${Input.Field} {
    border: none;
    outline: none;
  }
`;
