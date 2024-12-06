import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";

import type { DataSelectorSectionHeaderProps } from "../DataSelectorSectionHeader";
import DataSelectorSectionHeader from "../DataSelectorSectionHeader";
import { CONTAINER_WIDTH } from "../constants";

const DataSelectorLoading = ({ header }: DataSelectorSectionHeaderProps) =>
  header ? (
    <Box component="section" w={CONTAINER_WIDTH}>
      <DataSelectorSectionHeader header={header} />
      <LoadingAndErrorWrapper loading />
    </Box>
  ) : (
    <LoadingAndErrorWrapper loading />
  );

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorLoading;
