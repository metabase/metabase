import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const DownloadIcon = styled(Icon)`
  color: var(--mb-color-text-medium);

  &:hover {
    color: ${color("brand")};
    cursor: pointer;
  }
`;
