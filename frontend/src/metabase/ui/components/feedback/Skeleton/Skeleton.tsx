import type { SkeletonProps } from "@mantine/core";
import { Skeleton as MantineSkeleton } from "@mantine/core";
import { useMemo } from "react";

import { useRerenderOnShortcut } from "./hooks";

export const Skeleton = ({
  natural,
  ...props
}: SkeletonProps & {
  /** Automatically assign a natural-looking, random width to the skeleton */
  natural?: boolean;
}) => {
  // FIXME: remove this
  natural &&= !(window as { noNaturalSkeletons?: boolean }).noNaturalSkeletons;

  const key = useRerenderOnShortcut();

  const width = useMemo(
    () => (natural ? `${Math.random() * 30 + 50}%` : props.width),
    [natural, props.width],
  );
  return <MantineSkeleton key={key} width={width} {...props} />;
};
