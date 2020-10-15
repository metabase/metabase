import styled from "styled-components";
import { space, fontSize, fontWeight, letterSpacing } from "styled-system";
import { color } from "metabase/lib/colors";

const Text = styled.div`
  ${space};
  ${fontSize};
  ${fontWeight};
  ${letterSpacing};
  color: ${props => color(`text-${props.color}`)};
`;

Text.defaultProps = {
  fontSize: 14,
  color: "medium",
  mb: "8px",
  mt: "4px",
};

Text.propTypes = {};

export default Text;
