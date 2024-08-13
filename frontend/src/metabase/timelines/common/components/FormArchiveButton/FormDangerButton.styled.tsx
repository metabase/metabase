import styled from "@emotion/styled";

import Button from "metabase/core/components/Button/Button";

export const ArchiveButton = styled(Button)`
  color: var(--mb-color-danger);
  padding-left: 0;
  padding-right: 0;

  &:hover {
    color: var(--mb-color-danger);
    background-color: transparent;
  }
`;
