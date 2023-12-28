import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

export const RefreshLink = styled(Link)`
  color: ${color("text-light")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
