import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import { Box } from "metabase/ui";

import {
  DataSelectorSectionHeader,
  type DataSelectorSectionHeaderProps,
} from "../DataSelectorSectionHeader";
import { CONTAINER_WIDTH } from "../constants";

const DataSelectorListSkeleton = () => (
  <LoadingSkeleton w={CONTAINER_WIDTH} p="lg">
    <ListSkeleton rows={4} iconSize={18} />
  </LoadingSkeleton>
);

export const DataSelectorLoading = ({
  header,
}: DataSelectorSectionHeaderProps) =>
  header ? (
    <Box component="section" w={CONTAINER_WIDTH}>
      <DataSelectorSectionHeader header={header} />
      <DataSelectorListSkeleton />
    </Box>
  ) : (
    <DataSelectorListSkeleton />
  );
