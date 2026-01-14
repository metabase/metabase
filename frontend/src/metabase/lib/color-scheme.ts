export type ResolvedColorScheme = "light" | "dark";
export type ColorScheme = "auto" | ResolvedColorScheme;

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
