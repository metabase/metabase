import type { WhitelabelSettingKey } from "metabase/ui/colors/constants/whitelabel-colors";

export interface ColorOption {
  /** Key the color is stored under in the `application-colors` setting. */
  name: WhitelabelSettingKey;

  description: string;
}
