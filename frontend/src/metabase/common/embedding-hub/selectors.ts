import type { State } from "metabase/redux/store";
import { getUserIsAdmin } from "metabase/selectors/user";
import { isWithinIframe } from "metabase/utils/iframe";

export function canAccessEmbeddingHub(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state);
}
