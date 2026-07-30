import type { State } from "metabase/redux/store";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin } from "metabase/selectors/user";

// Must be in sync with CanAccessEmbeddingHub in frontend/src/metabase/embedding-hub-app/route-guards.tsx
export function canAccessEmbeddingHub(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return getUserIsAdmin(state);
}
