/* eslint-disable i18next/no-literal-string -- type tests, not rendered */
import { Box } from "@mantine/core";
import {
  Button,
  type ColorName,
  Icon,
  type IconName,
  MetabaseUIProvider,
  type MetabaseUIProviderProps,
  color,
} from "@metabase/ui";

export const colorName: ColorName = "core-brand";
export const iconName: IconName = "table";
export const cssVariable: string = color("core-brand");

// `Box` comes from Mantine: the augmentation must apply from importing `@metabase/ui` alone.
export const providerProps: MetabaseUIProviderProps = {
  children: null,
  colorScheme: "dark",
  fontFamily: "Inter, sans-serif",
  theme: { defaultRadius: "md" },
};

export const ok = (
  <>
    <MetabaseUIProvider colorScheme="light">content</MetabaseUIProvider>
    <Box c="core-brand" />
    <Box p="md" />
    <Button color="brand" />
    <Icon name="table" />
  </>
);

export const bad = (
  <>
    {/* @ts-expect-error not a color scheme */}
    <MetabaseUIProvider colorScheme="auto">content</MetabaseUIProvider>
    {/* @ts-expect-error not an icon name */}
    <Icon name="definitely-not-an-icon" />
    {/* @ts-expect-error augmentation replaces Mantine's stock colour names */}
    <Box c="red" />
    {/* @ts-expect-error not a ColorName */}
    <Box c="definitely-not-a-color" />
  </>
);

// @ts-expect-error not a ColorName
export const badColorName: ColorName = "grape";
