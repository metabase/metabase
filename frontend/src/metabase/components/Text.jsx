import styled from "styled-components";
import { space } from "system-components";
import colors from "metabase/lib/colors";

const Text = styled.p`
  ${space};
  color: ${props => colors[`text-${props.color}`]};
`;

Text.defaultProps = {
  className: "text-paragraph",
  color: "dark",
};

export default Text;
