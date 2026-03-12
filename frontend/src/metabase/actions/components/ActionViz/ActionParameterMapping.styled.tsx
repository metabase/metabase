// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { color } from "metabase/ui/utils/colors";

export const ParameterFormSection = styled.div`
  margin-top: var(--mantine-spacing-md);
`;

interface ParameterFormLabelProps {
  error?: boolean;
}

export const ParameterFormLabel = styled.label<ParameterFormLabelProps>`
  color: ${(props) => (props.error ? color("error") : color("text-secondary"))};
  font-size: 0.75rem;
  display: flex;
  gap: var(--mantine-spacing-sm);
  align-items: center;
  margin-bottom: var(--mantine-spacing-sm);
  font-weight: bold;
`;

export const ParameterFormBadge = styled.span`
  color: var(--mb-color-text-primary);
  background-color: var(--mb-color-background-tertiary);
  padding: var(--mantine-spacing-xs) var(--mantine-spacing-sm);
  border-radius: var(--mantine-spacing-xs);
`;
