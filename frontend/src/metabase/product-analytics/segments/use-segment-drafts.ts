import { useCallback, useSyncExternalStore } from "react";
import _ from "underscore";

import type { TableId } from "metabase-types/api";
import { isRecord } from "metabase-types/guards";

import type { SegmentDraft } from "./types";

const STORAGE_KEY = "metabase.product-analytics.segment-drafts";

type DraftsByTable = Record<string, SegmentDraft[]>;

// One empty list, so lists built from a table without drafts stay put.
const NO_DRAFTS: SegmentDraft[] = [];

const isDraft = (value: unknown): value is SegmentDraft =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  isRecord(value.query);

const parseDrafts = (raw: string | null): DraftsByTable => {
  try {
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([tableId, drafts]) => [
        tableId,
        Array.isArray(drafts) ? drafts.filter(isDraft) : [],
      ]),
    );
  } catch {
    return {};
  }
};

const readRaw = (): string | null => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * One store for every panel and picker, so a write from one never overwrites
 * drafts another made since it last read. Storage stays the source of truth;
 * the parsed copy is reused until it changes, and is all there is when storage
 * can't be written, so drafts then last for this page only.
 */
let cachedRaw: string | null | undefined;
let cachedDrafts: DraftsByTable = {};
const listeners = new Set<() => void>();

const getSnapshot = (): DraftsByTable => {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedDrafts = parseDrafts(raw);
  }
  return cachedDrafts;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const setDrafts = (drafts: DraftsByTable) => {
  const raw = JSON.stringify(drafts);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
  } catch {
    // Keeps cachedRaw as storage has it, so the snapshot stays this copy.
  }
  cachedDrafts = drafts;
  listeners.forEach((listener) => listener());
};

/**
 * Segment drafts for a table, kept for the browser session so a reload keeps
 * them. Drafts are usable in analyses right away, and saved or discarded
 * whenever the user likes.
 */
export const useSegmentDrafts = (tableId: TableId | undefined) => {
  const draftsByTable = useSyncExternalStore(subscribe, getSnapshot);
  const key = tableId !== undefined ? String(tableId) : undefined;
  const drafts =
    (key !== undefined ? draftsByTable[key] : undefined) ?? NO_DRAFTS;

  const update = useCallback(
    (updater: (drafts: SegmentDraft[]) => SegmentDraft[]) => {
      if (key === undefined) {
        return;
      }
      const current = getSnapshot();
      setDrafts({ ...current, [key]: updater(current[key] ?? []) });
    },
    [key],
  );

  const addDraft = useCallback(
    (draft: Omit<SegmentDraft, "id">) =>
      update((current) => [
        ...current,
        { id: _.uniqueId(`draft-${Date.now()}-`), ...draft },
      ]),
    [update],
  );

  const updateDraft = useCallback(
    (id: string, changes: Omit<SegmentDraft, "id">) =>
      update((current) =>
        current.map((d) => (d.id === id ? { id, ...changes } : d)),
      ),
    [update],
  );

  const removeDraft = useCallback(
    (id: string) => update((current) => current.filter((d) => d.id !== id)),
    [update],
  );

  /** Puts a removed draft back, e.g. from an undo. */
  const restoreDraft = useCallback(
    (draft: SegmentDraft) =>
      update((current) =>
        current.some((d) => d.id === draft.id) ? current : [...current, draft],
      ),
    [update],
  );

  return { drafts, addDraft, updateDraft, removeDraft, restoreDraft };
};
