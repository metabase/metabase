import type * as React from "react";

import { Box, Flex } from "metabase/ui";

import DataSelectorSectionHeaderS from "./DataSelectorSectionHeader.module.css";

export type DataSelectorSectionHeaderProps = {
  header?: React.ReactElement;
};

const DataSelectorSectionHeader = ({
  header,
}: DataSelectorSectionHeaderProps) => (
  <Flex
    p="md"
    align="center"
    className={DataSelectorSectionHeaderS.DataSelectorSectionHeaderContainer}
  >
    <Box component="h3" color="var(--mb-color-text-dark)">
      {header}
    </Box>
  </Flex>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorSectionHeader;
