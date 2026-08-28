import type { ReactNode } from "react";

import { Box, Stack, Text, ThemeProvider } from "metabase/ui";
import { deriveFullMetabaseTheme } from "metabase/ui/colors";
import type { ColorName } from "metabase/ui/colors/types";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";

const getThemeVars = (
  colorScheme: ResolvedColorScheme,
): Record<`--${string}`, string> => {
  const { colors } = deriveFullMetabaseTheme({ colorScheme });
  return Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [
      `--mb-color-${name}`,
      value,
    ]),
  );
};

const { colors: LIGHT_THEME_COLORS } = deriveFullMetabaseTheme({
  colorScheme: "light",
});

const PANEL_BACKGROUNDS: Record<ResolvedColorScheme, string> = {
  light: LIGHT_THEME_COLORS["background-primary"],
  dark: LIGHT_THEME_COLORS["background-primary-inverse"],
};

const DEFAULT_PADDING = "96px";

interface StoryBoardPanelProps {
  colorScheme: ResolvedColorScheme;
  background: string;
  padding: string;
  children: ReactNode;
}

const StoryBoardPanel = ({
  colorScheme,
  background,
  padding,
  children,
}: StoryBoardPanelProps) => (
  <ThemeProviderContext.Provider value={{ withCssVariables: true }}>
    <ThemeProvider
      resolvedColorScheme={colorScheme}
      cssVariablesSelector={`[data-story-board-theme="${colorScheme}"][data-mantine-color-scheme]`}
    >
      <Stack
        gap="3rem"
        data-story-board-theme={colorScheme}
        data-mantine-color-scheme={colorScheme}
        style={{
          ...getThemeVars(colorScheme),
          padding,
          backgroundColor: background,
        }}
      >
        {children}
      </Stack>
    </ThemeProvider>
  </ThemeProviderContext.Provider>
);

interface StoryBoardProps {
  title: string;
  background?: ColorName;
  /** Padding around each panel's content — tighten it for dense layouts. */
  padding?: string;
  children: ReactNode;
}

export const StoryBoard = ({
  title,
  background,
  padding = DEFAULT_PADDING,
  children,
}: StoryBoardProps) => {
  const getPanelBackground = (colorScheme: ResolvedColorScheme) =>
    background
      ? `var(--mb-color-${background})`
      : PANEL_BACKGROUNDS[colorScheme];

  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        minHeight: "100vh",
      }}
    >
      <StoryBoardPanel
        colorScheme="light"
        background={getPanelBackground("light")}
        padding={padding}
      >
        <Text fz="1.5rem" fw="bold" c="text-primary">
          {title}
        </Text>
        {children}
      </StoryBoardPanel>
      <StoryBoardPanel
        colorScheme="dark"
        background={getPanelBackground("dark")}
        padding={padding}
      >
        <Text fz="1.5rem" fw="bold" style={{ visibility: "hidden" }}>
          {title}
        </Text>
        {children}
      </StoryBoardPanel>
    </Box>
  );
};
