import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import { Box, Group, Skeleton, Stack } from "metabase/ui";

const LOG_LINES_COUNT = 16;
const CONTROL_HEIGHT = 40;

/** The log filter controls and the log output, while the logs first load. */
export const LogsSkeleton = () => (
  <Stack gap="lg">
    <Group gap="lg" wrap="nowrap">
      <Skeleton h={CONTROL_HEIGHT} flex={1} radius="sm" />
      <Skeleton h={CONTROL_HEIGHT} w="12rem" radius="sm" />
      <Skeleton h={CONTROL_HEIGHT} w="8rem" radius="sm" />
    </Group>
    <Box
      p="lg"
      bd="1px solid var(--mb-color-border-neutral)"
      bdrs="0.5rem"
      bg="background_page-secondary"
    >
      <Stack gap="sm">
        {Array.from({ length: LOG_LINES_COUNT }, (_, index) => (
          <Skeleton
            key={index}
            h={10}
            w={getSkeletonLineWidth(index)}
            radius="xs"
          />
        ))}
      </Stack>
    </Box>
  </Stack>
);
