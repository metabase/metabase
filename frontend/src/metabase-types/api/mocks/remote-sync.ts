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
