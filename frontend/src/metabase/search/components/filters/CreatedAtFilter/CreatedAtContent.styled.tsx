/* eslint-disable react/prop-types */
import styled from "@emotion/styled";
import { DateAllOptions } from "metabase/components/DateAllOptions";

export const CreatedAtDatePicker = styled(DateAllOptions)`
  & [data-testid="date-picker-shortcuts"] {
    padding: 0;
  }
`;
