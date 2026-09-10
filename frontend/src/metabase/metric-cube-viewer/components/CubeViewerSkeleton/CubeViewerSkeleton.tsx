import { Group, Paper, SimpleGrid, Skeleton, Stack } from "metabase/ui";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";

import S from "./CubeViewerSkeleton.module.css";

const SKELETON_CARD_COUNT = 4;

export function CubeViewerSkeleton() {
  return (
    <Stack gap="xl" data-testid="cube-viewer-skeleton">
      <Group justify="space-between" wrap="nowrap">
        <Skeleton h="2rem" w="16rem" />
        <Skeleton h="2rem" w="8rem" />
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <Paper
            key={index}
            withBorder
            shadow="none"
            className={S.skeletonCard}
          >
            <ChartSkeleton display="bar" />
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
