import type { SkeletonProps } from "@mantine/core";
import { Skeleton as MantineSkeleton } from "@mantine/core";

export const Skeleton = (props: SkeletonProps) => (
  <MantineSkeleton {...props} />
);
