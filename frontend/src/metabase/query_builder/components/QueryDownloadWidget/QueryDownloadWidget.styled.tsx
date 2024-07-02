import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const DownloadIcon = styled(Icon)`
  color: var(--mb-color-text-medium);

  &:hover {
    color: var(--mb-color-brand);
    cursor: pointer;
  }
`;
