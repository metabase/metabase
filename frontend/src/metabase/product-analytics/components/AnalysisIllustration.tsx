import type { ComponentType } from "react";

import { Box, Flex, SimpleGrid, Stack } from "metabase/ui";

import type { AnalysisKind } from "../spec/types";

const HEIGHT = 88;
const FADE = [1, 0.75, 0.5, 0.3] as const;

const fade = (index: number): number => FADE[Math.min(index, FADE.length - 1)];

const FUNNEL_WIDTHS = ["100%", "74%", "34%", "14%"];

const FunnelIllustration = () => (
  <Stack h={HEIGHT} gap={6} justify="flex-end">
    {FUNNEL_WIDTHS.map((width, index) => (
      <Box key={width} w={width} h={16} bg="accent0" opacity={fade(index)} />
    ))}
  </Stack>
);

const PATHS_ROWS = 3;
const PATHS_COLUMNS = 3;

const PathsIllustration = () => (
  <Flex h={HEIGHT} align="center" gap="sm">
    <Box w={48} h={14} bg="accent1" />
    <Box w={1} h={54} bg="accent1" opacity={0.5} />
    <SimpleGrid cols={PATHS_COLUMNS} spacing="sm" verticalSpacing={8} flex={1}>
      {Array.from({ length: PATHS_ROWS * PATHS_COLUMNS }, (_, index) => (
        <Box
          key={index}
          h={14}
          bg="accent1"
          opacity={fade(index % PATHS_COLUMNS)}
        />
      ))}
    </SimpleGrid>
  </Flex>
);

const HABIT_HEIGHTS = [100, 68, 44, 30, 20, 12, 6];

const HabitIllustration = () => (
  <Flex h={HEIGHT} align="flex-end" gap={8}>
    {HABIT_HEIGHTS.map((height, index) => (
      <Box
        key={height}
        flex={1}
        h={`${height}%`}
        bg="accent2"
        opacity={fade(Math.floor(index / 2))}
      />
    ))}
  </Flex>
);

const LIFECYCLE_RETURNING_HEIGHTS = [16, 20, 24, 30, 38];

const LifecycleIllustration = () => (
  <Stack h={HEIGHT} gap={0} justify="flex-end">
    <Flex align="flex-end" gap="md">
      {LIFECYCLE_RETURNING_HEIGHTS.map((height) => (
        <Stack key={height} flex={1} gap={2}>
          <Box h={6} bg="accent3" />
          <Box h={height} bg="accent3" opacity={0.85} />
          <Box h={8} bg="accent3" opacity={0.5} />
        </Stack>
      ))}
    </Flex>
    <Box h={1} my={4} bg="accent3" opacity={0.3} />
    <Flex gap="md">
      {LIFECYCLE_RETURNING_HEIGHTS.map((height) => (
        <Box key={height} flex={1} h={10} bg="accent3" opacity={0.25} />
      ))}
    </Flex>
  </Stack>
);

const COHORT_SIZE = 4;

const CohortsIllustration = () => (
  <Stack h={HEIGHT} gap={6} justify="flex-end">
    {Array.from({ length: COHORT_SIZE }, (_, row) => (
      <SimpleGrid key={row} cols={COHORT_SIZE} spacing={8}>
        {Array.from({ length: COHORT_SIZE - row }, (_, column) => (
          <Box key={column} h={16} bg="accent5" opacity={fade(column)} />
        ))}
      </SimpleGrid>
    ))}
  </Stack>
);

const ILLUSTRATIONS: Record<AnalysisKind, ComponentType> = {
  funnel: FunnelIllustration,
  paths: PathsIllustration,
  habit: HabitIllustration,
  lifecycle: LifecycleIllustration,
  cohorts: CohortsIllustration,
};

type AnalysisIllustrationProps = {
  kind: AnalysisKind;
};

/** Decorative mini chart for an analysis type card. */
export const AnalysisIllustration = ({ kind }: AnalysisIllustrationProps) => {
  const Illustration = ILLUSTRATIONS[kind];
  return (
    <Box aria-hidden>
      <Illustration />
    </Box>
  );
};
