import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

import OperatorSelectorComponent from "metabase/query_builder/components/filters/OperatorSelector";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Input from "metabase/core/components/Input";

export const OperatorSelector = styled(OperatorSelectorComponent)`
  margin-bottom: ${space(1)};
`;

export const ArgumentSelector = styled(FieldValuesWidget)`
  margin-bottom: ${space(1)};
`;

export const ValuesPickerContainer = styled.div`
  grid-column: 2;
`;

export const BetweenContainer = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
`;

export const NumberSeparator = styled.span`
  color: ${color("text-light")};
  font-weight: bold;
  padding: 0 ${space(1)};
`;

export const NumberInput = styled(Input)`
  border-color: ${color("border")};
  width: 10rem;
`;
