import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import NumericInput from "metabase/core/components/NumericInput";
import Icon from "metabase/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const InputRoot = styled.div`
  display: flex;
  align-items: center;
`;

export const InputField = styled(NumericInput)`
  width: 3rem;
  text-align: center;
`;

export const InputDivider = styled.div`
  color: ${color("text-dark")};
  margin: 0 0.5rem;
`;

export const InputClearIcon = styled(Icon)`
  color: ${color("text-light")};
`;

export const InputClearButton = styled(IconButtonWrapper)`
  margin-left: auto;
`;
