import styled from "@emotion/styled";

import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

export const AlertIcon = styled(Icon)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
