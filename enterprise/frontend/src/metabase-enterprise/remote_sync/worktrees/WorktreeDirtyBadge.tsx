import { useGetRemoteSyncHasChangesQuery } from "metabase-enterprise/api";
import type { WorktreeId } from "metabase-types/api";

import { CollectionSyncStatusBadge } from "../components/SyncedCollectionsSidebarSection";

export function WorktreeDirtyBadge({ worktreeId }: { worktreeId: WorktreeId }) {
  const { data } = useGetRemoteSyncHasChangesQuery({
    "worktree-id": worktreeId,
  });
  return data?.is_dirty ? <CollectionSyncStatusBadge /> : null;
}
