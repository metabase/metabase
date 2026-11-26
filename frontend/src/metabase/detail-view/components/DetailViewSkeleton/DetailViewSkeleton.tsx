import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { DETAIL_VIEW_PADDING_LEFT } from "metabase/detail-view/constants";
import { Box, Group, Skeleton, Stack, type StackProps, rem } from "metabase/ui";

import DetailViewPageS from "../DetailViewPage/DetailViewPage.module.css";

const AVATAR_SIZE = 80;
const COLUMN_NAME_WIDTH = rem(224);
const DEFAULT_ROW_COUNT = 8;

/** The avatar, title, and subtitle of a record's `Header`. */
export function DetailHeaderSkeleton() {
  return (
    <Group gap="xxl" wrap="nowrap">
      <Skeleton h={AVATAR_SIZE} w={AVATAR_SIZE} circle flex="none" />
      <Stack gap="sm" flex={1}>
        <Skeleton h={32} w="40%" radius="xs" />
        <Skeleton h={14} w="20%" radius="xs" />
      </Stack>
    </Group>
  );
}

type DetailsGroupSkeletonProps = Omit<StackProps, "children"> & {
  rows?: number;
};

/** The column name and value rows of a `DetailsGroup`. */
export function DetailsGroupSkeleton({
  rows = DEFAULT_ROW_COUNT,
  ...props
}: DetailsGroupSkeletonProps) {
  return (
    <Stack gap="xl" maw={rem(900)} w="100%" {...props}>
      {Array.from({ length: rows }, (_, index) => (
        <Group key={index} gap="xxl" wrap="nowrap">
          <Box w={COLUMN_NAME_WIDTH} flex="none">
            <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
          </Box>
          <Skeleton
            h={14}
            w={`calc(${getSkeletonLineWidth(index + 3)} / 2)`}
            radius="xs"
          />
        </Group>
      ))}
    </Stack>
  );
}

/** Stands in for a `DetailViewPage` while its record loads. */
export function DetailViewPageSkeleton({ rows }: { rows?: number }) {
  return (
    <LoadingSkeleton bg="background_page-primary" gap={0} mih="100%">
      <Box
        pl={rem(DETAIL_VIEW_PADDING_LEFT)}
        pr="xxl"
        py={rem(64)}
        className={DetailViewPageS.header}
      >
        <Box ml={rem(-8)}>
          <DetailHeaderSkeleton />
        </Box>
      </Box>
      <Box p="xxl" pl={rem(DETAIL_VIEW_PADDING_LEFT)}>
        <DetailsGroupSkeleton rows={rows} />
      </Box>
    </LoadingSkeleton>
  );
}
