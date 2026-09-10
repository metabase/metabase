import type { LoaderProps as MantineLoaderProps } from "@mantine/core";
import { Loader as MantineLoader, Stack, Text } from "@mantine/core";
import type React from "react";

import { LOADER_LABEL_SIZES, isLoaderNamedSize } from "./Loader.config";

export interface LoaderProps extends Omit<MantineLoaderProps, "type"> {
  type?: "oval" | "dots";
  label?: string;
  "data-testid"?: string;
}

type CustomLoaderType = React.ComponentType<{ label?: string }> | undefined;

let CustomLoader: CustomLoaderType;

export const setCustomLoader = (component: CustomLoaderType) => {
  CustomLoader = component;
};

export const Loader = ({
  size = "md",
  label,
  "data-testid": dataTestId = "loading-indicator",
  ...props
}: LoaderProps) => {
  if (CustomLoader) {
    return <CustomLoader label={label} />;
  }

  const labelSize = isLoaderNamedSize(size) ? LOADER_LABEL_SIZES[size] : "md";

  return label ? (
    <Stack justify="center" align="center" gap="sm" mt="xxl">
      <MantineLoader {...props} data-testid={dataTestId} size={size} />
      <Text c="text-disabled" size={labelSize}>
        {label}
      </Text>
    </Stack>
  ) : (
    <MantineLoader {...props} data-testid={dataTestId} size={size} />
  );
};
