import { getUserIsAdmin } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { isWithinIframe } from "metabase/utils/iframe";

export function canAccessEmbeddingHub(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state);
}
