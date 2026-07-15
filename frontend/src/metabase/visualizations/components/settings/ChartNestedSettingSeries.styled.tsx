// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon, TextInputBlurChange } from "metabase/ui";

export const OptionsIcon = styled(Icon)`
  color: var(--mb-color-text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--mb-color-core-brand);
  }
`;

export const SeriesNameInput = styled(TextInputBlurChange)`
  width: auto;
`;
