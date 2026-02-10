/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";

import { Text } from "metabase/ui";

export const BoldCode = ({ children, ...props }) => (
  <Text fw="bold" color="brand" component="span" {...props}>
    <code>{children}</code>
  </Text>
);

BoldCode.propTypes = {
  children: PropTypes.any.isRequired,
};
