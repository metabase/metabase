import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";
import { color } from "metabase/lib/colors";

export const SessionTimeoutSettingRoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 500px;
  min-height: 45px;
  width: 100%;
`;

export const SessionTimeoutInputContainer = styled.div`
  display: flex;
  align-items: stretch;
`;

export const SessionTimeoutInput = styled(InputBlurChange)`
  border-color: ${color("border")};
  width: 70px;
  margin-right: 0.5rem;
`;
