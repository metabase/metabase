import TextInput from "metabase/components/TextInput";
import { color } from "metabase/lib/colors";
import styled from "styled-components";

export const LicenseInputContainer = styled.div`
  display: flex;
  flex-wrap: nowrap;
`;

export const LicenseInput = styled(TextInput)`
  flex-grow: 1;
  margin-right: 8px;
`;

export const LicenseErrorMessage = styled.div`
  margin-top: 8px;
  white-space: nowrap;
  color: ${color("error")};
`;
