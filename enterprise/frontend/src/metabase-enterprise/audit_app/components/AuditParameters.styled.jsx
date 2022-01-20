import styled from "styled-components";

import TextInput from "metabase/components/TextInput";

export const AuditParametersInput = styled(TextInput)`
  display: inline-flex;
  width: 240px;

  & + & {
    margin-left: 1rem;
  }
`;
