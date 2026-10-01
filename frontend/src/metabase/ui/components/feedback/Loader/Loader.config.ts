import { Loader, type MantineThemeOverride, getSize, rem } from "@mantine/core";

import S from "./Loader.module.css";

export const LOADER_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
} as const;

export type LoaderNamedSize = keyof typeof LOADER_SIZES;

/** Labels only use two text sizes, so they stay consistent across loader sizes. */
export const LOADER_LABEL_SIZES = {
  xs: "sm",
  sm: "sm",
  md: "md",
  lg: "md",
  xl: "md",
} as const satisfies Record<LoaderNamedSize, "sm" | "md">;

export function isLoaderNamedSize(size: unknown): size is LoaderNamedSize {
  return typeof size === "string" && size in LOADER_SIZES;
}

export const loaderOverrides: MantineThemeOverride["components"] = {
  Loader: Loader.extend({
    classNames: {
      root: S.root,
    },
    vars: (_theme, { size = "md", color }) => ({
      root: {
        "--loader-size": isLoaderNamedSize(size)
          ? rem(LOADER_SIZES[size])
          : getSize(size, "loader-size"),
        "--loader-color": color ? undefined : "var(--mb-color-icon-brand)",
      },
    }),
  }),
};
