import styled from "@emotion/styled";

import Input from "metabase/core/components/Input";

export const AuditParametersInput = styled(Input)`
  display: inline-flex;
  width: 240px;

  & + & {
    margin-left: 1rem;
  }
`;
