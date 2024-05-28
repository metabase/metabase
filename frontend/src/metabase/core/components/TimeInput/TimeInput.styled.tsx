import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import NumericInput from "metabase/core/components/NumericInput";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

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

interface InputPeriodButtonProps {
  isSelected?: boolean;
}

export const InputMeridiemContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-left: 0.5rem;
`;

export const InputMeridiemButton = styled.button<InputPeriodButtonProps>`
  color: ${props => (props.isSelected ? color("brand") : color("text-light"))};
  cursor: ${props => (props.isSelected ? "" : "pointer")};
  font-weight: ${props => (props.isSelected ? "bold" : "")};
`;

export const InputClearButton = styled(IconButtonWrapper)`
  margin-left: auto;
`;
