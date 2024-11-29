import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";

import type { DataSelectorSectionHeaderProps } from "../DataSelectorSectionHeader";
import DataSelectorSectionHeader from "../DataSelectorSectionHeader";

const DataSelectorLoading = ({ header }: DataSelectorSectionHeaderProps) =>
  header ? (
    <Box component="section" w={300}>
      <DataSelectorSectionHeader header={header} />
      <LoadingAndErrorWrapper loading />
    </Box>
  ) : (
    <LoadingAndErrorWrapper loading />
  );

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorLoading;
