import _ from "underscore";

import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";

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
