import React from "react";

import { Flex } from "grid-styled";
import cx from "classnames";

import Subhead from "metabase/components/Subhead";

const ViewSection = ({ bottom, className, ...props }) => (
  <Flex
    align="center"
    className={cx(
      "wrapper py2",
      bottom ? "border-top" : "border-bottom",
      className,
    )}
    {...props}
  />
);

export const ViewHeading = ({ ...props }) => <Subhead {...props} />;

export const ViewSubHeading = ({ ...props }) => (
  <div className="text-medium text-bold" {...props} />
);

export default ViewSection;
