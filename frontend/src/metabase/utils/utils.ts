import { t } from "ttag";
import _ from "underscore";

import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

// pretty limited.  just does 0-9 for right now.
export function numberToWord(num: number) {
  const names = [
    t`zero`,
    t`one`,
    t`two`,
    t`three`,
    t`four`,
    t`five`,
    t`six`,
    t`seven`,
    t`eight`,
    t`nine`,
  ];

  if (num >= 0 && num <= 9) {
    return names[num];
  } else {
    return "" + num;
  }
}

export function equals(a: unknown, b: unknown) {
  return _.isEqual(a, b);
}

/**
 * @deprecated
 * In most cases we want to use specific token features, not the type of build.
 * Use only we want to display something differently based on specifically the build,
 * ie: "Switch binary" vs "Put a valid token in the settings"
 */
export const isEEBuild = () => PLUGIN_IS_EE_BUILD.isEEBuild();
