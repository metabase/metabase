import type { LoaderProps } from "@mantine/core";
import { Loader as MantineLoader, getSize } from "@mantine/core";
import type { HTMLAttributes } from "react";

const SIZES: Record<string, string> = {
  xs: "1rem",
  sm: "1.25rem",
  md: "1.5rem",
  lg: "2rem",
  xl: "3.5rem",
};

export const Loader = ({ size = "md", ...props }: LoaderProps) => (
  <LoaderTestId>
    <MantineLoader {...props} size={getSize({ size, sizes: SIZES })} />
  </LoaderTestId>
);

/** Provides a testid we can use to detect whether the loading indicator is present */
export const LoaderTestId = (props: HTMLAttributes<HTMLDivElement>) => (
  <div aria-busy data-testid="loading-indicator" {...props} />
);
