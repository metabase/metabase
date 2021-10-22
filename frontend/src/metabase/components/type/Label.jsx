/* eslint-disable react/prop-types */
import React from "react";

import Text from "metabase/components/type/Text";

const Label = ({ children, ...props }) => (
  <Text mb="8px" color="dark" {...props} fontSize="14px" fontWeight={700}>
    {children}
  </Text>
);

export default Label;
