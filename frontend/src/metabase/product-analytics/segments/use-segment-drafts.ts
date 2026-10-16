import { useCallback, useState } from "react";
import _ from "underscore";

import type { TableId } from "metabase-types/api";
import { isRecord } from "metabase-types/guards";

import type { SegmentDraft } from "./types";

const STORAGE_KEY = "metabase.product-analytics.segment-drafts";

type DraftsByTable = Record<string, SegmentDraft[]>;

const isDraft = (value: unknown): value is SegmentDraft =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  isRecord(value.query);

const readDrafts = (): DraftsByTable => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
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

const writeDrafts = (drafts: DraftsByTable) => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Storage can be full or disabled; drafts then last for this page only.
  }
};

/**
 * Segment drafts for a table, kept for the browser session so a reload keeps
 * them. Drafts are usable in analyses right away, and saved or discarded
 * whenever the user likes.
 */
export const useSegmentDrafts = (tableId: TableId | undefined) => {
  const [draftsByTable, setDraftsByTable] = useState(readDrafts);
  const key = tableId !== undefined ? String(tableId) : undefined;
  const drafts = key !== undefined ? (draftsByTable[key] ?? []) : [];

  const update = useCallback(
    (updater: (drafts: SegmentDraft[]) => SegmentDraft[]) => {
      if (key === undefined) {
        return;
      }
      setDraftsByTable((current) => {
        const next = { ...current, [key]: updater(current[key] ?? []) };
        writeDrafts(next);
        return next;
      });
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

  return { drafts, addDraft, updateDraft, removeDraft };
};
