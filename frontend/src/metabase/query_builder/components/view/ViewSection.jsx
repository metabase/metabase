import React from "react";

import { Flex } from "grid-styled";
import cx from "classnames";

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

export default ViewSection;
