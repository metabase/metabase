import type { ColorScheme } from "metabase/ui/colors/types/color-scheme";

export type {
  ColorScheme,
  ResolvedColorScheme,
} from "metabase/ui/colors/types/color-scheme";

export const isValidColorScheme = (value: string): value is ColorScheme => {
  return ["light", "dark", "auto"].includes(value);
};

export const getUserColorScheme = (): ColorScheme | undefined => {
  if (
    window.MetabaseUserColorScheme &&
    isValidColorScheme(window.MetabaseUserColorScheme)
  ) {
    return window.MetabaseUserColorScheme;
  }
};

export const setUserColorSchemeAfterUpdate = (value: ColorScheme) => {
  window.MetabaseUserColorScheme = value;
};
