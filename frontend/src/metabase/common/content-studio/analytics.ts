import { trackSimpleEvent } from "metabase/analytics";
import type {
  ContentStudioOpenedEvent,
  ContentStudioScopeChangedEvent,
  ContentStudioWorktreeCreatedEvent,
  ContentStudioWorktreeDeletedEvent,
} from "metabase-types/analytics/event";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

export const trackContentStudioOpened = () => {
  trackSimpleEvent({
    event: "content_studio_opened",
    triggered_from: "nav_menu",
  } satisfies ContentStudioOpenedEvent);
};

export const trackContentStudioWorktreeCreated = (
  worktreeId: RemoteSyncWorktreeId,
) => {
  trackSimpleEvent({
    event: "content_studio_worktree_created",
    target_id: worktreeId,
  } satisfies ContentStudioWorktreeCreatedEvent);
};

export const trackContentStudioWorktreeDeleted = (
  worktreeId: RemoteSyncWorktreeId,
) => {
  trackSimpleEvent({
    event: "content_studio_worktree_deleted",
    target_id: worktreeId,
  } satisfies ContentStudioWorktreeDeletedEvent);
};

export const trackContentStudioScopeChanged = (
  worktreeId: RemoteSyncWorktreeId | null,
) => {
  trackSimpleEvent({
    event: "content_studio_scope_changed",
    event_detail: worktreeId == null ? "main" : "worktree",
  } satisfies ContentStudioScopeChangedEvent);
};
