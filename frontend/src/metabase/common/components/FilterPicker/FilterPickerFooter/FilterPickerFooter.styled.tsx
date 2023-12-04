import styled from "@emotion/styled";
import { Flex } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const FilterFooterRoot = styled(Flex)`
  &:not(:only-child) {
    border-top: 1px solid ${color("border")};
  }
`;
