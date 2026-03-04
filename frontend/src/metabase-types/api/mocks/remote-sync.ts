import type { RemoteSyncEntity } from "../remote-sync";

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
