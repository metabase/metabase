import styled from "@emotion/styled";

import Input from "metabase/core/components/Input";

export const LicenseInputContainer = styled.div`
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
`;

export const LicenseTextInput = styled(Input)`
  flex-grow: 1;
  margin-right: 8px;
`;

export const LicenseErrorMessage = styled.div`
  margin-top: 8px;
  white-space: nowrap;
  color: var(--mb-color-error);
`;
