import type { MantineColorsTuple } from "@mantine/core";

import type { ColorSettings } from "metabase-types/api/color-settings";

import type { ColorName } from "./colors/types";
import type { RadiusScaleKey, ShadowScaleKey, SpacingScaleKey } from "./theme";

declare module "@mantine/core" {
  export interface MantineThemeOther {
    hasCustomChartFontSize?: boolean;
    updateColorSettings?: (settings: ColorSettings) => void;
  }

  export interface MantineThemeColorsOverride {
    colors: Record<
      ColorName | "inherit" | "transparent" | "currentColor" | "none" | "unset",
      MantineColorsTuple
    >;
  }

  // Register custom scales for style-prop autocomplete.
  export interface MantineThemeSizesOverride {
    spacing: Record<SpacingScaleKey, string>;
    radius: Record<RadiusScaleKey, string>;
    shadows: Record<ShadowScaleKey, string>;
  }
}
