import styled from "@emotion/styled";
import { Flex } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const FlexWithScroll = styled(Flex)`
  overflow-y: auto;
`;

export const FilterHeaderRoot = styled(Flex)`
  border-bottom: 1px solid ${color("border")};
`;

FilterHeaderRoot.defaultProps = {
  direction: "row",
  justify: "space-between",
  p: "sm",
};

export const FilterFooterRoot = styled(Flex)`
  &:not(:only-child) {
    border-top: 1px solid ${color("border")};
  }
`;

FilterFooterRoot.defaultProps = {
  direction: "row",
  justify: "space-between",
  p: "sm",
};
