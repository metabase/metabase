import { Loader as MantineLoader, getSize, rem } from "@mantine/core";
import type { LoaderProps } from "@mantine/core";

const SIZES: Record<string, string> = {
  xs: rem(16),
  sm: rem(20),
  md: rem(24),
  lg: rem(32),
  xl: rem(56),
};

export const Loader = ({ size = "md", ...props }: LoaderProps) => (
  <MantineLoader {...props} size={getSize({ size, sizes: SIZES })} />
);
