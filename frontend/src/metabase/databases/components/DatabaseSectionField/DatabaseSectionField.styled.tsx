// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Button } from "metabase/common/components/Button";

export const SectionButton = styled(Button)`
  color: var(--mb-color-brand);
  padding: 0;
  border: none;
  border-radius: 0;

  &:hover {
    background-color: transparent;
  }
`;
