import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export interface TextProps {
  color?: string;
  fontSize?: string;
  fontWeight?: number;
  mb?: string;
}

const Text = styled.div<TextProps>`
  color: ${props => color(`text-${props.color}`)};
  font-size: ${props => props.fontSize};
  font-weight: ${props => props.fontWeight};
`;

Text.defaultProps = {
  color: "medium",
};

export default Text;
