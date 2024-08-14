import type { Undo } from "metabase-types/store/undo";

export const createMockUndo = (opts?: Partial<Undo>): Undo => ({
  message: "The filter was auto-connected to all questions.",
  actionLabel: "Undo",
  showProgress: true,
  timeout: 12000,
  type: "filterAutoConnectDone",
  extraInfo: {},
  id: 12,
  _domId: 12,
  icon: "check",
  canDismiss: true,
  timeoutId: 636,
  startedAt: 1718628033795,
  count: 1,
  ...opts,
});
