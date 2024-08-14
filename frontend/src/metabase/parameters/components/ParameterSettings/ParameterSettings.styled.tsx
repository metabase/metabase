import styled from "@emotion/styled";

import { ParameterValueWidget } from "../ParameterValueWidget";

export const SettingLabel = styled.label`
  display: block;
  color: var(--mb-color-text-medium);
  margin-bottom: 0.5rem;
  font-weight: bold;
`;

export const SettingLabelError = styled.span`
  color: var(--mb-color-error);
`;

export const SettingValueWidget = styled(ParameterValueWidget)`
  color: var(--mb-color-text-dark);
  padding: 0.75rem 0.75rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-white);
`;
