import styled from "@emotion/styled";
import { CSSProperties } from "react";

import { color } from "metabase/lib/colors";

const IconWrapper = styled.div<{
  borderRadius: CSSProperties["borderRadius"];
  bg?: string;
}>`
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: ${props => props.borderRadius};
`;

IconWrapper.defaultProps = {
  borderRadius: 6,
  bg: color("bg-medium"),
};

export default IconWrapper;
