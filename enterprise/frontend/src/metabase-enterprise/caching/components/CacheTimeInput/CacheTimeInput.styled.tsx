import styled from "@emotion/styled";

import NumericInput from "metabase/core/components/NumericInput";

export const TimeInputRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
`;

export const TimeInput = styled(NumericInput)`
  width: 3.125rem;
  text-align: center;
`;

export const TimeInputMessage = styled.div`
  color: var(--mb-color-text-dark);
`;
