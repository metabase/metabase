import styled from "@emotion/styled";

import { CopyButton } from "metabase/components/CopyButton";

export const PasswordCopyButton = styled(CopyButton)`
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
