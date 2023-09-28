import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Flex } from "metabase/ui";

export const Footer = styled(Flex)`
  border-top: 1px solid ${color("border")};
`;

Footer.defaultProps = {
  direction: "row",
  justify: "space-between",
  p: "sm",
};
