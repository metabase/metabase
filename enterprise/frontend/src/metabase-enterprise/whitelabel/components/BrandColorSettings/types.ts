import type { MetabaseColorKey } from "metabase/ui/colors/types";

export interface ColorOption {
  /** Key the color is stored under in the `application-colors` setting. */
  name: string;

  /** Token the setting's value feeds, used to show the current default. */
  tokenName: MetabaseColorKey;

  description: string;
}
