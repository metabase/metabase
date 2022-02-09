import styled from "@emotion/styled";
import { color } from "styled-system";
import { color as metabaseColors } from "metabase/lib/colors";

const IconWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  ${color};
  border-radius: ${props => props.borderRadius};
`;

IconWrapper.defaultProps = {
  borderRadius: 6,
  bg: metabaseColors("bg-medium"),
};

export default IconWrapper;
