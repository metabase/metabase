import type { State } from "metabase/redux/store";
import { getUserIsAdmin } from "metabase/selectors/user";
import { isWithinIframe } from "metabase/utils/iframe";

// Must be in sync with CanAccessEmbeddingHub in frontend/src/metabase/embedding-hub/route-guards.tsx
export function canAccessEmbeddingHub(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state);
}
