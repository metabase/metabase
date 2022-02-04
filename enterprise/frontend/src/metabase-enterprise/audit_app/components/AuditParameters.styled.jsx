import styled from "@emotion/styled";

import TextInput from "metabase/components/TextInput";

export const AuditParametersInput = styled(TextInput)`
  display: inline-flex;
  width: 240px;

  & + & {
    margin-left: 1rem;
  }
`;
