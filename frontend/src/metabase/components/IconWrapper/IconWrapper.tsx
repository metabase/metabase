import styled from "@emotion/styled";
import type { CSSProperties } from "react";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default IconWrapper;
