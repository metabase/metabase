import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import ParameterValueWidget from "../ParameterValueWidget";

export const SettingLabel = styled.label`
  display: block;
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
  font-weight: bold;
`;

export const SettingLabelError = styled.span`
  color: ${color("error")};
`;

export const SettingValueWidget = styled(ParameterValueWidget)`
  color: ${color("text-dark")};
  padding: 0.75rem 0.75rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("white")};
`;
