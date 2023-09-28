import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Flex } from "metabase/ui";

export const Header = styled(Flex)`
  border-bottom: 1px solid ${color("border")};
`;

Header.defaultProps = {
  direction: "row",
  justify: "space-between",
  p: "sm",
};
