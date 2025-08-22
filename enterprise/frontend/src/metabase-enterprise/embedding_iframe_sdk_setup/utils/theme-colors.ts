import { t } from "ttag";

import type { MetabaseColors } from "embedding-sdk-bundle";
import type { ColorName } from "metabase/lib/colors/types";

export const getConfigurableThemeColors = () =>
  [
    {
      name: t`Brand Color`,
      key: "brand",
      originalColorKey: "brand",
    },
    {
      name: t`Text Color`,
      key: "text-primary",
      originalColorKey: "text-dark",
    },
    {
      name: t`Background Color`,
      key: "background",
      originalColorKey: "bg-white",
    },
  ] as const satisfies {
    name: string;
    key: keyof MetabaseColors;

    // Populate colors from appearance settings.
    originalColorKey: ColorName;
  }[];
