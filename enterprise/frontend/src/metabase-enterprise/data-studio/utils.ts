import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import type { State } from "metabase-types/store";

export function canAccessDataStudio(state: State) {
  return !getIsEmbeddingIframe(state);
}
