import type { SkeletonProps } from "@mantine/core";
import { Skeleton as MantineSkeleton } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

export const Skeleton = ({
  natural,
  ...props
}: SkeletonProps & {
  /** Automatically assign a natural-looking, random width to the skeleton */
  natural?: boolean;
}) => {
  // FIXME: remove this
  natural &&= !(window as { noNaturalSkeletons?: boolean }).noNaturalSkeletons;

  // For triggering rerenders
  const [value, setValue] = useState(0);

  // FIXME: REMOVE THIS TEMPORARY PROTOTYPING CODE
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        setValue(val => val + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const width = useMemo(
    () => (natural ? `${Math.random() * 30 + 50}%` : props.width),
    [natural, props.width],
  );
  return <MantineSkeleton key={value} width={width} {...props} />;
};
