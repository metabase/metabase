import styled from "@emotion/styled";
import PropTypes from "prop-types";

import { color } from "metabase/lib/colors";

const Text = styled.div`
  color: ${props => color(`text-${props.color}`)};
  font-size: ${props => props.fontSize};
  font-weight: ${props => props.fontWeight};
`;

Text.defaultProps = {
  color: "medium",
};

Text.propTypes = {
  color: PropTypes.string,
  fontSize: PropTypes.string,
  fontWeight: PropTypes.number,
};

export default Text;
