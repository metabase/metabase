import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const OptionItemTitle = styled.div`
  color: var(--mb-color-brand);
`;

export const OptionItemDescription = styled.div`
  color: var(--mb-color-text-medium);
`;

export const OptionItemRoot = styled.li`
  padding: 0.5rem 1.5rem;
  cursor: pointer;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);

    ${OptionItemTitle}, ${OptionItemDescription} {
      color: var(--mb-color-text-white);
    }
  }
`;
