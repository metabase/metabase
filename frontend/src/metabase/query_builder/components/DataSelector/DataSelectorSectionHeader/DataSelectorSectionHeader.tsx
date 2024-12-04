import type * as React from "react";

import { Flex, Text } from "metabase/ui";

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
    <Text component="h3" color="var(--mb-color-text-dark)">
      {header}
    </Text>
  </Flex>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorSectionHeader;
