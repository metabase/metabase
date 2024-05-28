import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

const IconWrapper = styled.div`
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
