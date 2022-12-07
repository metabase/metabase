import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const SettingRoot = styled.li`
  margin: 1rem 1rem 2rem;
`;

export const SettingContent = styled.div`
  display: flex;
`;

export const SettingWarningMessage = styled.div`
  color: ${color("accent4")};
  font-weight: bold;
  padding-top: 0.5rem;
`;

export const SettingErrorMessage = styled.div`
  color: ${color("error")};
  font-weight: bold;
  padding-top: 0.5rem;
`;

export const SettingEnvVarMessage = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
`;
