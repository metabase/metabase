import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import { Flex, Skeleton, Stack, type StackProps } from "metabase/ui";

const AVATAR_SIZE = 24;

type CommentsSkeletonProps = Omit<StackProps, "children"> & {
  comments?: number;
};

/** Comments with an avatar, an author line, and a couple of lines of text. */
export function CommentsSkeleton({
  comments = 3,
  gap = "xl",
  ...props
}: CommentsSkeletonProps) {
  return (
    <Stack gap={gap} {...props}>
      {Array.from({ length: comments }, (_, index) => (
        <Flex key={index} gap="md" align="flex-start">
          <Skeleton h={AVATAR_SIZE} w={AVATAR_SIZE} circle flex="none" />
          <Stack gap="sm" flex={1} pt={4}>
            <Skeleton h={14} w="40%" radius="xs" />
            <Skeleton h={12} w="100%" radius="xs" />
            <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
          </Stack>
        </Flex>
      ))}
    </Stack>
  );
}
