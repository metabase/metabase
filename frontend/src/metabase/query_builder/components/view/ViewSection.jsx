import React from "react";

import { Flex } from "grid-styled";

import Subhead from "metabase/components/Subhead";

const ViewSection = ({
  align = "center",
  bottom,
  trim,
  style,
  className,
  ...props
}) => (
  <Flex
    align={align}
    px={[1, 3]}
    style={style}
    {...props}
    className={className}
  />
);

export const ViewHeading = ({ ...props }) => <Subhead {...props} />;

export const ViewSubHeading = ({ ...props }) => (
  <div className="text-medium text-bold" {...props} />
);

export default ViewSection;
