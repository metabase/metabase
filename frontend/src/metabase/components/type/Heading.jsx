/* eslint-disable react/prop-types */
import React from "react";

import Text from "metabase/components/type/Text";

const Heading = ({ children, color, ...props }) => (
  <Text {...props} fontSize={32} fontWeight={900} color="dark">
    {children}
  </Text>
);

export default Heading;
