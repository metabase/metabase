import styled from "@emotion/styled";

import CheckBox from "metabase/core/components/CheckBox";

export const ConfirmationCheckbox = styled(CheckBox)`
  font-weight: 700;

  & + & {
    margin-top: 1rem;
  }
`;
