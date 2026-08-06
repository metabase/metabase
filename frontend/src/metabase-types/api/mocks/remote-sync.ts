import type { RemoteSyncEntity, RemoteSyncTask } from "../remote-sync";
import type { Worktree } from "../worktree";

export const createMockRemoteSyncEntity = (
  opts?: Partial<RemoteSyncEntity>,
): RemoteSyncEntity => ({
  id: 1,
  name: "My Question",
  model: "card",
  sync_status: "update",
  ...opts,
});

export const createMockDirtyCardEntity = (
  opts?: Partial<RemoteSyncEntity>,
): RemoteSyncEntity =>
  createMockRemoteSyncEntity({
    id: 1,
    model: "card",
    collection_id: 1,
    ...opts,
  });

export const createMockDirtyTransformEntity = (
  opts?: Partial<RemoteSyncEntity>,
): RemoteSyncEntity =>
  createMockRemoteSyncEntity({
    id: 10,
    model: "transform",
    name: "Test Transform",
    ...opts,
  });

export const createMockRemoteSyncTask = (
  opts?: Partial<RemoteSyncTask>,
): RemoteSyncTask => ({
  id: 1,
  worktree_id: null,
  sync_task_type: "export",
  status: "successful",
  progress: 1,
  started_at: "2000-01-01T00:00:00Z",
  ended_at: "2000-01-01T00:00:01Z",
  last_progress_report_at: null,
  error_message: null,
  initiated_by: 1,
  ...opts,
});

export const createMockWorktree = (opts?: Partial<Worktree>): Worktree => ({
  id: 1,
  branch: "feature-branch",
  creator_id: 1,
  created_at: "2000-01-01T00:00:00Z",
  updated_at: "2000-01-01T00:00:00Z",
  ...opts,
});
