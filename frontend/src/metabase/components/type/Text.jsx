import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

const Text = styled.div`
  color: ${props => color(`text-${props.color}`)};
  font-size: ${props => props.fontSize}px;
`;

Text.defaultProps = {
  color: "medium",
};

Text.propTypes = {};

export default Text;
