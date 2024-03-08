import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Flex } from "metabase/ui";

export const FilterFooterRoot = styled(Flex)`
  &:not(:only-child) {
    border-top: 1px solid ${color("border")};
  }
`;
