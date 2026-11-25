import type { ComponentPropsWithoutRef } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./ChartSkeleton.module.css";

export type ChartSkeletonImageProps = BoxProps &
  Omit<ComponentPropsWithoutRef<"svg">, keyof BoxProps>;

export const ChartSkeletonImage = ({
  children,
  ...props
}: ChartSkeletonImageProps) => (
  <Box
    component="svg"
    flex="1 1 0"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {/* The faint, pulsing opacity is on a group inside the image rather than
        the image itself, so a fade animating the image's opacity (skullet's
        reveals do) multiplies with it instead of replacing it, which would
        flash the image in the full text color. */}
    <g className={S.animated}>{children}</g>
  </Box>
);
