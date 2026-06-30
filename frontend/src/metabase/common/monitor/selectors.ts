import type { State } from "metabase/redux/store";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import {
  getUser,
  getUserIsAdmin,
  getUserIsAnalyst,
} from "metabase/selectors/user";

// Must be in sync with CanAccessMonitor in frontend/src/metabase/route-guards.tsx
export function canAccessMonitor(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsAnalyst(state);
}

// Gating for the Admin Tools pages migrated into the Monitor space (GDGT-2684):
// tasks, jobs, logs, model caching, notifications, erroring questions. These
// previously lived under /admin/tools, guarded by superuser (OSS) or the EE
// `monitoring` application permission (`can_access_monitoring`). Their backend
// APIs enforce `check-has-application-permission :monitoring`, so the narrower
// analyst-level Monitor guard is not sufficient for them.
// Must be in sync with CanAccessMonitoringTools in frontend/src/metabase/route-guards.tsx
export function canAccessMonitoringTools(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    (getUser(state)?.permissions?.can_access_monitoring ?? false)
  );
}
