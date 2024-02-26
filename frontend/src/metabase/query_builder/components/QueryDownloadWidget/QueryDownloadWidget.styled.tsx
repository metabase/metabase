import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

export const DownloadIcon = styled(Icon)`
  color: ${color("text-medium")};

  &:hover {
    color: ${color("brand")};
  }
`;
