import styled from "@emotion/styled";
import { Input } from "metabase/core/components/Input";
import { color } from "metabase/lib/colors";

export const LicenseInputContainer = styled.div`
  display: flex;
  flex-wrap: nowrap;
  // min-width: 680px;
  width: 680px;
`;

export const LicenseTextInput = styled(Input)`
  flex-grow: 1;
  margin-right: 8px;
`;

export const LicenseErrorMessage = styled.div`
  margin-top: 8px;
  white-space: nowrap;
  color: ${color("error")};
`;
