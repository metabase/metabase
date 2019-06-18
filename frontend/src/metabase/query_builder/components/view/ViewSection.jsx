import React from "react";

import { Flex } from "grid-styled";

import Subhead from "metabase/components/Subhead";

const ViewSection = ({ bottom, trim, style, className, ...props }) => (
  <Flex align="center" px={3} style={style} {...props} className={className} />
);

export const ViewHeading = ({ ...props }) => <Subhead {...props} />;

export const ViewSubHeading = ({ ...props }) => (
  <div className="text-medium text-bold" {...props} />
);

export default ViewSection;
