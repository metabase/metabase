import type * as React from "react";

import { Box, Flex } from "metabase/ui";

import DataSelectorSectionHeaderS from "./DataSelectorSectionHeader.module.css";

export type DataSelectorSectionHeaderProps = {
  header?: React.ReactElement;
};

export const DataSelectorSectionHeader = ({
  header,
}: DataSelectorSectionHeaderProps) => (
  <Flex p="md" align="center" className={DataSelectorSectionHeaderS.Container}>
    <Box component="h3" className={DataSelectorSectionHeaderS.Header}>
      {header}
    </Box>
  </Flex>
);
