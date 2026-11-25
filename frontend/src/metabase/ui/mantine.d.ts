import type { MantineColorsTuple } from "@mantine/core";

import type { ColorSettings } from "metabase-types/api/color-settings";

import type { ColorName } from "./colors/types";
import type { RadiusScaleKey, ShadowScaleKey, SpacingScaleKey } from "./theme";

declare module "@mantine/core" {
  /**
   * Add more theme options to Mantine's `theme.other` field using this type.
   *
   * Refer to [https://v6.mantine.dev/theming/theme-object/#other]
   **/
  export interface MantineThemeOther {
    colorScheme: "light" | "dark";
    hasCustomChartFontSize?: boolean;
    updateColorSettings?: (settings: ColorSettings) => void;
  }

  export interface MantineTheme {
    fn: {
      themeColor: (colorName: string) => string;
    };
  }

  export interface MantineThemeColorsOverride {
    colors: Record<
      ColorName | "inherit" | "transparent" | "currentColor" | "none" | "unset",
      MantineColorsTuple
    >;
  }

  // Register the custom spacing/radius/shadow scales so scale
  // tokens show up in editor autocomplete for style props (p/m/gap/radius/
  // shadow). Values are defined in frontend/src/metabase/ui/theme.ts.
  export interface MantineThemeSizesOverride {
    spacing: Record<SpacingScaleKey, string>;
    radius: Record<RadiusScaleKey, string>;
    shadows: Record<ShadowScaleKey, string>;
  }
}
