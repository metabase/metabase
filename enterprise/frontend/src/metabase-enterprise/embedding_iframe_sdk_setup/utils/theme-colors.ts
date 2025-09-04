import { t } from "ttag";

import type { MetabaseColors } from "embedding-sdk-bundle";
import type { ColorName } from "metabase/lib/colors/types";

export const getConfigurableThemeColors = () =>
  [
    {
      name: t`Brand color`,
      key: "brand",
      originalColorKey: "brand",
    },
    {
      name: t`Text color`,
      key: "text-primary",
      originalColorKey: "text-dark",
    },
    {
      name: t`Background color`,
      key: "background",
      originalColorKey: "bg-white",
    },
  ] as const satisfies {
    name: string;
    key: keyof MetabaseColors;

    // Populate colors from appearance settings.
    originalColorKey: ColorName;
  }[];
