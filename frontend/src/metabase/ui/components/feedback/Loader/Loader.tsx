import type { LoaderProps as MantineLoaderProps } from "@mantine/core";
import { Loader as MantineLoader, Stack, Text, getSize } from "@mantine/core";
import type React from "react";

const SIZES: Record<string, string> = {
  xs: "1rem",
  sm: "1.25rem",
  md: "1.5rem",
  lg: "2rem",
  xl: "3.5rem",
};

interface LoaderProps extends MantineLoaderProps {
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

  return label ? (
    <Stack justify="center" align="center" gap="sm" mt="xl">
      <MantineLoader
        {...props}
        data-testid={dataTestId}
        size={getSize(SIZES[size] ?? size)}
      />
      <Text c="text-disabled" size="xl">
        {label}
      </Text>
    </Stack>
  ) : (
    <MantineLoader
      {...props}
      data-testid={dataTestId}
      size={getSize(SIZES[size] ?? size)}
    />
  );
};
