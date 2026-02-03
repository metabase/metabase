// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Button } from "metabase/common/components/Button/Button";

export const ArchiveButton = styled(Button)`
  color: var(--mb-color-danger);
  padding-left: 0;
  padding-right: 0;

  &:hover {
    color: var(--mb-color-danger);
    background-color: transparent;
  }
`;
