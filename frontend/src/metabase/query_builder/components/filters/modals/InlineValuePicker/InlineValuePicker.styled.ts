import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

import OperatorSelectorComponent from "metabase/query_builder/components/filters/OperatorSelector";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import NumericInput from "metabase/core/components/NumericInput";

export const OperatorSelector = styled(OperatorSelectorComponent)`
  margin-bottom: ${space(1)};
`;

export const ArgumentSelector = styled(FieldValuesWidget)`
  min-height: 55px;
`;

export const ValuesPickerContainer = styled.div`
  grid-column: 2;
  ul.input {
    margin-bottom: 0;
    :focus-within {
      border-color: ${color("brand")};
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
  height: 53px;
  width: 100%;
  align-items: center;
`;

export const NumberSeparator = styled.span`
  color: ${color("text-light")};
  font-weight: bold;
  padding: 0 ${space(2)};
`;

export const NumberInput = styled(NumericInput)`
  width: 10rem;
`;
