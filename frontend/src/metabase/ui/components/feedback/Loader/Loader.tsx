import type { LoaderProps as MantineLoaderProps } from "@mantine/core";
import { Loader as MantineLoader, Stack, Text } from "@mantine/core";
import type React from "react";

export interface LoaderProps extends Omit<MantineLoaderProps, "size"> {
  /**
   * Diameter of the loader: `xs` 12px, `sm` 14px, `md` 16px, `lg` 18px,
   * `xl` 22px. Raw numbers and CSS lengths still work as an escape hatch, but
   * only the named sizes get the ring thickness from the spec.
   *
   * @default "md"
   */
  size?: MantineLoaderProps["size"];
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
      <MantineLoader {...props} data-testid={dataTestId} size={size} />
      <Text c="text-disabled" size="xl">
        {label}
      </Text>
    </Stack>
  ) : (
    <MantineLoader {...props} data-testid={dataTestId} size={size} />
  );
};
