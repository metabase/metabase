import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IntrospectorRow, TransformTargetTable } from "../types";

/**
 * Default grace period for the demo-only "Recently deleted" section.
 *
 * The transform delete is a hard delete on the backend
 * (`src/metabase/transforms/crud.clj:175` — `(t2/delete! :model/Transform …)`),
 * so once the API call fires, there's no real undo. We stage the call
 * client-side and only commit when the timer expires; "Restore" just clears
 * the pending entry without ever hitting the API.
 */
const DEFAULT_DELAY_MS = 30_000;

export interface PendingDelete {
  id: number;
  name: string;
  target_table: TransformTargetTable | null | undefined;
  alsoDropTable: boolean;
  expiresAt: number; // epoch ms
}

interface StageOptions {
  alsoDropTable: boolean;
  /** Override the grace period; mostly useful for tests. */
  delayMs?: number;
}

interface UsePendingDeletesArgs {
  /** Called when a row's grace period expires (or `Delete now` is clicked). */
  commitDelete: (row: PendingDelete) => Promise<void> | void;
}

export function usePendingDeletes({ commitDelete }: UsePendingDeletesArgs) {
  const [pending, setPending] = useState<PendingDelete[]>([]);
  // Per-row timers — kept in a ref so they don't trigger re-renders.
  const timersRef = useRef<Map<number, number>>(new Map());

  const removePending = useCallback((id: number) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
    const timer = timersRef.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const commitNow = useCallback(
    async (id: number) => {
      // Read the entry, then drop the timer + state, then fire commit.
      // (Done in this order so commitDelete's RTK Query invalidation can't
      // race with our local filtering of the staged row.)
      let entry: PendingDelete | undefined;
      setPending((prev) => {
        entry = prev.find((p) => p.id === id);
        return prev.filter((p) => p.id !== id);
      });
      const timer = timersRef.current.get(id);
      if (timer != null) {
        window.clearTimeout(timer);
        timersRef.current.delete(id);
      }
      if (entry) {
        await commitDelete(entry);
      }
    },
    [commitDelete],
  );

  const stage = useCallback(
    (row: IntrospectorRow, opts: StageOptions) => {
      const delay = opts.delayMs ?? DEFAULT_DELAY_MS;
      const entry: PendingDelete = {
        id: row.id,
        name: row.name,
        target_table: row.target_table ?? null,
        alsoDropTable: opts.alsoDropTable,
        expiresAt: Date.now() + delay,
      };
      // If a previous timer is already running for this id (re-stage), clear it.
      const existing = timersRef.current.get(row.id);
      if (existing != null) {
        window.clearTimeout(existing);
      }
      const timer = window.setTimeout(() => {
        timersRef.current.delete(row.id);
        void commitNow(row.id);
      }, delay);
      timersRef.current.set(row.id, timer);
      setPending((prev) => {
        const without = prev.filter((p) => p.id !== row.id);
        return [...without, entry];
      });
    },
    [commitNow],
  );

  const restore = useCallback(
    (id: number) => {
      removePending(id);
    },
    [removePending],
  );

  const restoreAll = useCallback(() => {
    timersRef.current.forEach((handle) => window.clearTimeout(handle));
    timersRef.current.clear();
    setPending([]);
  }, []);

  // Clean up any in-flight timers if the component unmounts.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((handle) => window.clearTimeout(handle));
      timers.clear();
    };
  }, []);

  const pendingIds = useMemo(
    () => new Set(pending.map((p) => p.id)),
    [pending],
  );

  return {
    pending,
    pendingIds,
    stage,
    restore,
    restoreAll,
    commitNow,
  };
}
