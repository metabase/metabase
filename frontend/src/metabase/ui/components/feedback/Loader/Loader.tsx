import type { LoaderProps } from "@mantine/core";
import { Loader as MantineLoader, getSize } from "@mantine/core";

const SIZES: Record<string, string> = {
  xs: "1rem",
  sm: "1.25rem",
  md: "1.5rem",
  lg: "2rem",
  xl: "3.5rem",
};

type CustomLoader = (() => React.JSX.Element) | undefined;

let customLoader: CustomLoader;

export const setCustomLoader = (component: CustomLoader) => {
  customLoader = component;
};

export const Loader = ({ size = "md", ...props }: LoaderProps) => {
  if (customLoader) {
    return customLoader();
  }
  return <MantineLoader {...props} size={getSize(SIZES[size])} />;
};
