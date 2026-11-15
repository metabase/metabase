import { t } from "ttag";

import type { MetabaseColors } from "embedding-sdk-bundle/types/ui";
import {
  WHITELABEL_KEY_TO_COLOR_KEY,
  type WhitelabelSettingKey,
} from "metabase/ui/colors/constants/whitelabel-colors";
import type { ColorName } from "metabase/ui/colors/types";

export type ConfigurableThemeColor = {
  name: string;

  /**
   * Key embedders set this color under in the SDK theme. `charts` is excluded
   * because it holds an array of colors rather than a single one.
   */
  key: Exclude<keyof MetabaseColors, "charts">;

  /**
   * Key this color is stored under in the `application-colors` setting.
   * Omitted for colors the admin cannot whitelabel.
   */
  settingKey?: WhitelabelSettingKey;

  /** Token supplying the default when there is no whitelabel override. */
  tokenKey: ColorName;
};

export const getConfigurableThemeColors = (): ConfigurableThemeColor[] => [
  {
    name: t`Brand color`,
    key: "brand",
    settingKey: "brand",
    tokenKey: WHITELABEL_KEY_TO_COLOR_KEY.brand,
  },
  {
    name: t`Text color`,
    key: "text-primary",
    tokenKey: "text-primary",
  },
  {
    name: t`Background color`,
    key: "background",
    tokenKey: "background_page-primary",
  },
];
