import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

export const RefreshLink = styled(Link)`
  color: ${color("text-light")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
