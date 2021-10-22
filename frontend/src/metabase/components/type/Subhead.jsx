/* eslint-disable react/prop-types */
import React from "react";

import Text from "metabase/components/type/Text";

const Subhead = ({ children, ...props }) => (
  <Text mb="4px" color="dark" {...props} fontSize="18px" fontWeight={700}>
    {children}
  </Text>
);

export default Subhead;
