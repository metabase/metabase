/* eslint-disable react/prop-types */
import React from "react";
import { Box } from "@rebass/grid";

import { PAGE_PADDING } from "metabase/browse/constants";

export default function BrowseApp({ children }) {
  return <Box mx={PAGE_PADDING}>{children}</Box>;
}
