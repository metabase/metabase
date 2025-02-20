import type { MetabaseTheme } from "./MetabaseTheme";

export * from "./default-component-theme";
// eslint-disable-next-line no-literal-metabase-strings -- file name
export * from "./MetabaseTheme";

export const defineMetabaseTheme = (theme: MetabaseTheme): MetabaseTheme =>
  theme;
