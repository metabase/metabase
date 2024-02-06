import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import ParameterValueWidget from "../ParameterValueWidget";

export const SettingsRoot = styled.div`
  padding: 1.5rem 1rem;
`;

export const SettingSection = styled.div`
  margin-bottom: 2rem;
`;

export const SettingLabel = styled.label`
  display: block;
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
  font-weight: bold;
`;

export const SettingLabelError = styled.span`
  margin: 0 0.5rem;
  color: ${color("error")};
`;

export const SettingValueWidget = styled(ParameterValueWidget)`
  color: ${color("text-dark")};
  padding: 0.75rem 0.75rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("white")};
`;

export const SettingRequiredContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin: 0.5rem 0;
`;

export const SettingRequiredLabel = styled.label`
  display: block;
  margin-top: 0.35rem;
  font-weight: 700;
  color: ${color("text-medium")};
  cursor: pointer;
`;
