import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";
import TextInput from "metabase/components/TextInput";
import { color } from "metabase/lib/colors";

export const SessionTimeoutSettingRoot = styled.div`
  margin: 0.5rem 0;
  max-width: 500px;
  width: 100%;
`;

export const SessionTimeoutSettingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 45px;
`;

export const SessionTimeoutInputContainer = styled.div`
  display: flex;
  align-items: stretch;
`;

interface SessionTimeoutInputProps {
  hasError?: boolean;
}
export const SessionTimeoutInput = styled(TextInput)<SessionTimeoutInputProps>`
  margin-right: 0.5rem;
`;

export const ErrorMessage = styled.div`
  text-align: right;
  margin-top: 0.5rem;
  color: ${color("error")};
`;
