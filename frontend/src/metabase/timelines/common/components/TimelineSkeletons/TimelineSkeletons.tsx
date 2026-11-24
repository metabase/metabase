import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import { Box, Flex, Skeleton, Stack } from "metabase/ui";

const BUTTON_HEIGHT = 40;

function PanelEventRowSkeleton({ index }: { index: number }) {
  return (
    <Flex py="xxs" px="md" gap="xxxs">
      <Flex w="2rem" h="2rem" justify="center" align="center" flex="none">
        <Skeleton h={16} w={16} radius="xs" />
      </Flex>
      <Stack gap="xs" flex={1} pt="sm" pr="md">
        <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
        <Skeleton h={10} w={88} radius="xs" />
      </Stack>
    </Flex>
  );
}

/** Stands in for the timeline sidebar's panel: a create button over an expanded timeline. */
export function TimelinePanelSkeleton() {
  return (
    <Box mx="xl">
      <Skeleton h={BUTTON_HEIGHT} w={120} radius="sm" mb="lg" />
      <Flex align="center" gap="sm" h="1.5rem">
        <Skeleton h={16} w={16} radius="xs" flex="none" />
        <Skeleton h={14} w="50%" radius="xs" />
      </Flex>
      <Box my="lg" mx="-xl">
        {Array.from({ length: 3 }, (_, index) => (
          <PanelEventRowSkeleton key={index} index={index} />
        ))}
      </Box>
    </Box>
  );
}
