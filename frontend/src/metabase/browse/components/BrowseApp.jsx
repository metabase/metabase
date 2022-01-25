/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "theme-ui";

import { PAGE_PADDING } from "metabase/browse/constants";

export default function BrowseApp({ children }) {
  return <Box mx={PAGE_PADDING}>{children}</Box>;
}
