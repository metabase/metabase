import styled from "@emotion/styled";
import { Flex } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

export const FilterFooterRoot = styled(Flex)`
  &:not(:only-child) {
    border-top: 1px solid ${color("border")};
  }
`;
