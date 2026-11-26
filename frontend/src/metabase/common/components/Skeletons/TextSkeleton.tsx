import { Skeleton, Stack, type StackProps } from "metabase/ui";

const FULL_LINE_WIDTHS = ["100%", "95%", "90%"];
const LAST_LINE_WIDTH = "60%";

export type TextSkeletonProps = Omit<StackProps, "children"> & {
  lines?: number;
  lineHeight?: number;
  /** Adds a heading-sized line above the paragraph. */
  withTitle?: boolean;
};

/** A paragraph of text lines, optionally under a heading. */
export function TextSkeleton({
  lines = 3,
  lineHeight = 12,
  withTitle = false,
  gap = "sm",
  ...props
}: TextSkeletonProps) {
  return (
    <Stack gap={gap} {...props}>
      {withTitle && <Skeleton h={24} w="35%" radius="xs" mb="sm" />}
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          h={lineHeight}
          w={
            lines > 1 && index === lines - 1
              ? LAST_LINE_WIDTH
              : FULL_LINE_WIDTHS[index % FULL_LINE_WIDTHS.length]
          }
          radius="xs"
        />
      ))}
    </Stack>
  );
}
