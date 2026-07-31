import type { RemoteSyncEntity, RemoteSyncWorktree } from "../remote-sync";

export const createMockRemoteSyncEntity = (
  opts?: Partial<RemoteSyncEntity>,
): RemoteSyncEntity => ({
  id: 1,
  name: "My Question",
  model: "card",
  sync_status: "update",
  ...opts,
});

export const createMockRemoteSyncWorktree = (
  opts?: Partial<RemoteSyncWorktree>,
): RemoteSyncWorktree => ({
  id: 1,
  branch: "feature-branch",
  creator_id: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
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
