import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import { Box } from "metabase/ui";

import type { DataSelectorSectionHeaderProps } from "../DataSelectorSectionHeader";
import { DataSelectorSectionHeader } from "../DataSelectorSectionHeader";
import { CONTAINER_WIDTH } from "../constants";

const SKELETON_ROW_COUNT = 6;

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

const DataSelectorListSkeleton = () => (
  <LoadingSkeleton w={CONTAINER_WIDTH} maw="100%" px="lg" py="md">
    <ListSkeleton rows={SKELETON_ROW_COUNT} />
  </LoadingSkeleton>
);
