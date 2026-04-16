// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Input } from "metabase/common/components/Input";
import { Icon, TextInputBlurChange } from "metabase/ui";

export const OptionsIcon = styled(Icon)`
  color: var(--mb-color-text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const SeriesNameInput = styled(TextInputBlurChange)`
  width: auto;

  ${({ description }) =>
    description &&
    `
    ${Input.Field} {
      padding-top: 1rem;
      padding-bottom: 0.375rem;
    }

    ${Input.Subtitle} {
      top: 0.375rem;
      left: 0.8rem;
    }
  `}
`;
