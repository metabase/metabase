import type { SkeletonProps } from "@mantine/core";
import { Skeleton as MantineSkeleton } from "@mantine/core";
import { useMemo } from "react";

export const Skeleton = ({
  natural,
  ...props
}: SkeletonProps & {
  /** Automatically assign a natural-looking, random width to the skeleton */
  natural?: boolean;
}) => {
  const width = useMemo(
    () => (natural ? `${Math.random() * 30 + 50}%` : props.width),
    [natural, props.width],
  );
  return <MantineSkeleton width={width} {...props} />;
};

export type { SkeletonProps };
