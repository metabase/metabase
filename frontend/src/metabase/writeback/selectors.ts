import { getSetting } from "metabase/selectors/settings";
import { State } from "metabase-types/store";

export function getWritebackEnabled(state: State) {
  return getSetting(state, "experimental-enable-actions");
}
