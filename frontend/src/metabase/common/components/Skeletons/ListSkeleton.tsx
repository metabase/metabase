import { Flex, Skeleton, Stack, type StackProps } from "metabase/ui";

import { getSkeletonLineWidth } from "./widths";

export type ListSkeletonProps = Omit<StackProps, "children"> & {
  rows?: number;
  /** Size of the square icon placeholder at the start of each row; `0` hides it. */
  iconSize?: number;
  textHeight?: number;
  /** Adds a shorter second line under each row's label. */
  withDescription?: boolean;
};

/** Rows of an icon and a label, for lists, menus, and sidebars. */
export function ListSkeleton({
  rows = 6,
  iconSize = 16,
  textHeight = 12,
  withDescription = false,
  gap = "lg",
  ...props
}: ListSkeletonProps) {
  return (
    <Stack gap={gap} {...props}>
      {Array.from({ length: rows }, (_, index) => (
        <Flex key={index} align="center" gap="sm">
          {iconSize > 0 && (
            <Skeleton h={iconSize} w={iconSize} radius="xs" flex="none" />
          )}
          <Stack gap="xs" flex={1}>
            <Skeleton
              h={textHeight}
              w={getSkeletonLineWidth(index)}
              radius="xs"
            />
            {withDescription && (
              <Skeleton
                h={textHeight * 0.75}
                w={getSkeletonLineWidth(index + 3)}
                radius="xs"
              />
            )}
          </Stack>
        </Flex>
      ))}
    </Stack>
  );
}
