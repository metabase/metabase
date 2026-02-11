import { t } from "ttag";

import type { MetabaseColors } from "embedding-sdk-bundle/types/ui";
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
      originalColorKey: "text-primary",
    },
    {
      name: t`Background color`,
      key: "background",
      originalColorKey: "background-primary",
    },
  ] as const satisfies {
    name: string;
    key: keyof MetabaseColors;

    // Populate colors from appearance settings.
    originalColorKey: ColorName;
  }[];
