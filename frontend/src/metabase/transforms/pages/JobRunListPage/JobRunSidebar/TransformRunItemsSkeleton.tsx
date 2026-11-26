import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import { Card, Group, Skeleton, Stack } from "metabase/ui";

import S from "./TransformRunItem.module.css";

const ROWS_COUNT = 3;

/** Stands in for a card of `TransformRunItem`s while a run's transforms load. */
export function TransformRunItemsSkeleton() {
  return (
    <Card p={0} shadow="none" withBorder>
      {Array.from({ length: ROWS_COUNT }, (_, index) => (
        <Group
          key={index}
          className={S.transformItem}
          p="lg"
          gap="sm"
          wrap="nowrap"
          align="start"
        >
          <Skeleton h={16} w={16} radius="xs" flex="none" />
          <Stack gap="sm" flex={1} miw={0}>
            <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
            <Skeleton h={10} w="60%" radius="xs" />
            <Skeleton h={10} w="45%" radius="xs" />
          </Stack>
        </Group>
      ))}
    </Card>
  );
}
