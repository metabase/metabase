import { Flex, Skeleton, Stack, type StackProps } from "metabase/ui";

import { getSkeletonLineWidth } from "./widths";

const INPUT_HEIGHT = 40;

export type FormSkeletonProps = Omit<StackProps, "children"> & {
  fields?: number;
  /** Adds a right-aligned submit button placeholder below the fields. */
  withSubmit?: boolean;
};

/** Labelled inputs, for forms and settings panes. */
export function FormSkeleton({
  fields = 3,
  withSubmit = false,
  gap = "lg",
  ...props
}: FormSkeletonProps) {
  return (
    <Stack gap={gap} {...props}>
      {Array.from({ length: fields }, (_, index) => (
        <Stack key={index} gap="sm">
          <Skeleton
            h={12}
            w={`calc(${getSkeletonLineWidth(index)} / 3)`}
            radius="xs"
          />
          <Skeleton h={INPUT_HEIGHT} w="100%" radius="sm" />
        </Stack>
      ))}
      {withSubmit && (
        <Flex justify="flex-end">
          <Skeleton h={INPUT_HEIGHT} w={96} radius="sm" />
        </Flex>
      )}
    </Stack>
  );
}
