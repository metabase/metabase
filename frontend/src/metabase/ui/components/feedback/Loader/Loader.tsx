import type { LoaderProps } from "@mantine/core";
import { Loader as MantineLoader, getSize } from "@mantine/core";

const SIZES: Record<string, string> = {
  xs: "1rem",
  sm: "1.25rem",
  md: "1.5rem",
  lg: "2rem",
  xl: "3.5rem",
};

export const Loader = ({ size = "md", ...props }: LoaderProps) => (
  <MantineLoader {...props} size={getSize({ size, sizes: SIZES })} />
);
