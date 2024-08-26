import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

export const SettingTitle = styled.label`
  display: block;
  color: var(--mb-color-text-medium);
  font-weight: bold;
  text-transform: uppercase;
`;

export const SettingDescription = styled.div`
  line-height: 1.5;
  color: var(--mb-color-text-medium);
  margin: ${space(1)} 0;
  max-width: 38.75rem;
`;
