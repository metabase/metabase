// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const SettingsPopoverBody = styled.div`
  padding: var(--mantine-spacing-xl);
`;

export const RequiredToggleLabel = styled.label`
  font-weight: bold;
`;

export const Divider = styled.div`
  border-bottom: 1px solid var(--mb-color-border);
  margin: var(--mantine-spacing-md) 0;
`;

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--mantine-spacing-sm);
`;

export const SettingsTriggerIcon = styled(Icon)`
  color: var(--mb-color-text-secondary);

  &:hover {
    color: var(--mb-color-brand);
  }
`;
