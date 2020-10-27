import React from "react";

import { Box } from "grid-styled";

const PageHeader = ({ children }) => (
  <Box bg="white" className="border-bottom" py={"22px"}>
    {children}
  </Box>
);

export default PageHeader;
