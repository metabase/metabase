import type { SkeletonProps as MantineSkeletonProps } from "@mantine/core";
import { Skeleton as MantineSkeleton } from "@mantine/core";
import { useMemo } from "react";

export type SkeletonProps = MantineSkeletonProps & {
  /** Automatically assign a natural-looking, random width to the skeleton */
  natural?: boolean;
};

export const Skeleton = ({ natural, ...props }: SkeletonProps) => {
  const width = useMemo(
    () => (natural ? `${Math.random() * 30 + 50}%` : props.width),
    [natural, props.width],
  );
  return <MantineSkeleton width={width} {...props} />;
};
