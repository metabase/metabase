import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import { Flex, Skeleton, Stack, type StackProps } from "metabase/ui";

const REVISION_COUNT = 4;
const AVATAR_SIZE = 40;

/** Revision rows shaped like `RevisionHistoryTimeline`'s avatar timeline. */
export function RevisionHistoryTimelineSkeleton(
  props: Omit<StackProps, "children">,
) {
  return (
    <Stack p="xxl" maw={720} mx="auto" w="100%" gap="xl" {...props}>
      {Array.from({ length: REVISION_COUNT }, (_, index) => (
        <Flex key={index} align="flex-start">
          <Skeleton h={AVATAR_SIZE} w={AVATAR_SIZE} circle />
          <Flex flex={1} ml="lg" justify="space-between" gap="lg">
            <Stack gap="sm" flex={1}>
              <Skeleton h={14} w={120} radius="xs" />
              <Skeleton
                h={12}
                w={`calc(${getSkeletonLineWidth(index)} / 2)`}
                radius="xs"
              />
            </Stack>
            <Skeleton h={12} w={64} radius="xs" />
          </Flex>
        </Flex>
      ))}
    </Stack>
  );
}
