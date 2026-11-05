import cx from "classnames";
import type { ComponentPropsWithoutRef } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./ChartSkeleton.module.css";

export type ChartSkeletonImageProps = BoxProps &
  Omit<ComponentPropsWithoutRef<"svg">, keyof BoxProps>;

export const ChartSkeletonImage = ({
  className,
  ...props
}: ChartSkeletonImageProps) => (
  <Box
    component="svg"
    className={cx(S.animated, className)}
    flex="1 1 0"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  />
);
