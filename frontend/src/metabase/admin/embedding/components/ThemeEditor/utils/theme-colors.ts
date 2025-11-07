import { t } from "ttag";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import type { ColorName } from "metabase/lib/colors/types";

/**
 * Main theme colors that appear in the theme editor.
 * These are the primary colors shown in the "Main colors" section.
 */
export const getMainThemeColors = () =>
  [
    {
      name: t`Brand`,
      key: "brand",
      originalColorKey: "brand",
    },
    {
      name: t`Background`,
      key: "background",
      originalColorKey: "bg-white",
    },
    {
      name: t`Primary text`,
      key: "text-primary",
      originalColorKey: "text-dark",
    },
    {
      name: t`Secondary background`,
      key: "background-secondary",
      originalColorKey: "bg-light",
    },
  ] as const satisfies {
    name: string;
    key: keyof MetabaseColors;
    originalColorKey: ColorName;
  }[];
