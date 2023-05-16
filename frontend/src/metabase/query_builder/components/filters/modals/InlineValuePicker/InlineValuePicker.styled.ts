import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

import NumericInput from "metabase/core/components/NumericInput";

interface ValuesPickerContainerProps {
  fieldWidth?: string;
}

export const ValuesPickerContainer = styled.div<ValuesPickerContainerProps>`
  max-width: ${props => props.fieldWidth ?? "100%"};
  ul {
    margin-bottom: 0;
    :focus-within {
      border-color: ${color("brand")};
    }
    li {
      height: 30px;
    }
  }
  input {
    color: ${color("brand")};
    font-size: 0.875rem;

    ::placeholder {
      color: ${color("text-medium")};
    }
  }
`;

export const BetweenContainer = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
`;

export const NumberSeparator = styled.span`
  color: ${color("text-light")};
  font-weight: bold;
  padding: 0 ${space(2)};
`;

export const NumberInput = styled(NumericInput)`
  width: 8rem;
  input {
    height: 40px;
  }
`;
