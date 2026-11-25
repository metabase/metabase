/* eslint-disable i18next/no-literal-string -- type tests, not rendered */
import { Box, DEFAULT_THEME } from "@mantine/core";
import {
  Button,
  type ColorName,
  Icon,
  type IconName,
  type MantineTheme,
  MetabaseUIProvider,
  type MetabaseUIProviderProps,
  color,
} from "@metabase/ui";
import "@metabase/ui/styles.css";
import "@metabase/ui/fonts.css";

export const colorName: ColorName = "core-brand";
export const iconName: IconName = "table";
export const cssVariable: string = color("core-brand");

export const providerProps: MetabaseUIProviderProps = {
  children: null,
  colorScheme: "dark",
  fontFamily: "Inter, sans-serif",
  theme: { defaultRadius: "md" },
};

// `Box` comes from Mantine: the augmentation must apply from importing `@metabase/ui` alone.
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
    {/* @ts-expect-error use the top-level fontFamily prop */}
    <MetabaseUIProvider theme={{ fontFamily: "Inter" }}>
      content
    </MetabaseUIProvider>
    {/* @ts-expect-error the provider owns the palette */}
    <MetabaseUIProvider theme={{ colors: {} }}>content</MetabaseUIProvider>
    {/* @ts-expect-error use the top-level colorScheme prop */}
    <MetabaseUIProvider theme={{ other: { colorScheme: "dark" } }}>
      content
    </MetabaseUIProvider>
    {/* @ts-expect-error the provider owns theme.fn */}
    <MetabaseUIProvider theme={{ fn: {} }}>content</MetabaseUIProvider>
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

export function checkNativeTheme() {
  DEFAULT_THEME.fn?.themeColor("core-brand");
  // @ts-expect-error native Mantine does not supply Metabase's helpers
  DEFAULT_THEME.fn.themeColor("core-brand");
  // @ts-expect-error native Mantine does not supply the Metabase color scheme
  const colorScheme: "light" | "dark" = DEFAULT_THEME.other.colorScheme;
  return colorScheme;
}

export function checkColorSettingsCallback(theme: MantineTheme) {
  theme.other.updateColorSettings?.({});
  // @ts-expect-error the standalone provider does not supply this callback
  theme.other.updateColorSettings({});
}
