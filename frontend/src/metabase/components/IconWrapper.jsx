import styled from "@emotion/styled";
import { Flex } from "theme-ui";
import { color } from "styled-system";
import { color as metabaseColors } from "metabase/lib/colors";

const IconWrapper = styled(Flex)`
  ${color};
  border-radius: ${props => props.borderRadius};
`;

IconWrapper.defaultProps = {
  borderRadius: 6,
  bg: metabaseColors("bg-medium"),
  align: "center",
  justify: "center",
};

export default IconWrapper;
