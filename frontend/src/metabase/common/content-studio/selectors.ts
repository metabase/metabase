import type { State } from "metabase/redux/store";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin } from "metabase/selectors/user";

// Must be in sync with CanAccessContentStudio in frontend/src/metabase/content-studio/route-guards.tsx
export function canAccessContentStudio(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return getUserIsAdmin(state);
}
