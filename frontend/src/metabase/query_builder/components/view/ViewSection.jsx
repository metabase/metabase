import React from "react";

import { Flex } from "grid-styled";
import cx from "classnames";

const ViewSection = ({ bottom, ...props }) => (
  <Flex
    align="center"
    className={cx("wrapper py2", bottom ? "border-top" : "border-bottom")}
    {...props}
  />
);

export default ViewSection;
