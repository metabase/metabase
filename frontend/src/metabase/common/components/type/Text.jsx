// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import PropTypes from "prop-types";

import { color } from "metabase/ui/utils/colors";

export const Text = styled.div`
  color: ${(props) => color(`text-${props.color ?? "medium"}`)};
  font-size: ${(props) => props.fontSize};
  font-weight: ${(props) => props.fontWeight};
`;

Text.propTypes = {
  color: PropTypes.string,
  fontSize: PropTypes.string,
  fontWeight: PropTypes.number,
};
