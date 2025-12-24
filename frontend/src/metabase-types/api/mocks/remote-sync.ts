import type { RemoteSyncEntity } from "../remote-sync";

export const createMockRemoteSyncEntity = (
  opts?: Partial<RemoteSyncEntity>,
): RemoteSyncEntity => ({
  id: 1,
  name: "My Question",
  description: null,
  created_at: "2015-01-01T20:10:30.200",
  updated_at: "2015-01-01T20:10:30.200",
  model: "card",
  sync_status: "update",
  ...opts,
});
