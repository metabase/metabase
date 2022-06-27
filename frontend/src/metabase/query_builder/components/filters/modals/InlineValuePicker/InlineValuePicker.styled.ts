import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import OperatorSelectorComponent from "metabase/query_builder/components/filters/OperatorSelector";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";

export const OperatorSelector = styled(OperatorSelectorComponent)`
  margin-bottom: ${space(1)};
`;

export const ArgumentSelector = styled(FieldValuesWidget)`
  margin-bottom: ${space(1)};
`;

export const ValuesPickerContainer = styled.div`
  grid-column: 2;
`;
