import type { State } from "metabase/redux/store";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/selectors/user";

// Must be in sync with CanAccessMonitor in frontend/src/metabase/route-guards.tsx
export function canAccessMonitor(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsAnalyst(state);
}
