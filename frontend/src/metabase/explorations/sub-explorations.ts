import type {
  Exploration,
  ExplorationId,
  ExplorationThreadId,
} from "metabase-types/api";

// "Explore further" spawns a follow-up thread from a clicked chart's page, but
// the backend doesn't persist which thread that page belonged to. We capture
// the child → parent thread link on the client at drill time and keep it in
// localStorage (per exploration) so the sidebar can nest sub-explorations.
const STORAGE_KEY = "metabase-explorations-sub-exploration-parents";

type ParentsByExploration = Record<string, Record<string, string>>;

function readAll(): ParentsByExploration {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(value: ParentsByExploration): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore write failures (e.g. storage disabled / quota exceeded).
  }
}

/** Map of childThreadId → parentThreadId for one exploration. */
export function getSubExplorationParents(
  explorationId: ExplorationId,
): Record<string, string> {
  return readAll()[String(explorationId)] ?? {};
}

export function setSubExplorationParent(
  explorationId: ExplorationId,
  childThreadId: ExplorationThreadId,
  parentThreadId: ExplorationThreadId,
): void {
  const all = readAll();
  const key = String(explorationId);
  all[key] = {
    ...(all[key] ?? {}),
    [String(childThreadId)]: String(parentThreadId),
  };
  writeAll(all);
}

/**
 * After an "explore further" call, derive the (child, parent) thread link from
 * the returned exploration: the parent is the thread that owns the drilled
 * page; the child is the freshly created thread (the one with the highest
 * position, which the backend stamps as max + 1).
 */
export function deriveSubExplorationLink(
  exploration: Exploration,
  drilledPageId: number,
): {
  childThreadId: ExplorationThreadId;
  parentThreadId: ExplorationThreadId;
} | null {
  const threads = exploration.threads ?? [];
  if (threads.length === 0) {
    return null;
  }

  const parentThread = threads.find((thread) =>
    (thread.blocks ?? []).some((block) =>
      (block.pages ?? []).some((page) => page.id === drilledPageId),
    ),
  );

  const childThread = threads.reduce((newest, thread) =>
    thread.position > newest.position ? thread : newest,
  );

  if (!parentThread || childThread.id === parentThread.id) {
    return null;
  }

  return { childThreadId: childThread.id, parentThreadId: parentThread.id };
}
