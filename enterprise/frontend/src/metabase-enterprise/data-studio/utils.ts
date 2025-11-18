import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

export function canAccessDataStudio(state: State) {
  return getUserIsAdmin(state) && !getIsEmbeddingIframe(state);
}
