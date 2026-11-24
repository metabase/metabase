import { useMemo } from "react";

import {
  REMEMBERED_SKELETON_KEY_PREFIX,
  toSkeletonFiller,
} from "metabase/common/components/Skeletons/remembered-skeletons";
import type {
  Collection,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
} from "metabase-types/api";

/*
 * PROTOTYPE: a collection page as last shown, kept in localStorage so its
 * loading skeleton draws that collection's header and rows on later visits,
 * including after a reload. It keeps layout, never content: every name is
 * stored as filler of the same length and letter case.
 */

type CollectionSketchItem = {
  model: CollectionItemModel;
  display?: CollectionItem["display"];
  name: string;
  editor?: { first_name: string; last_name: string };
};

export type CollectionSketch = {
  name?: string;
  /** Editable collections reserve room for a description under the name. */
  isEditable?: boolean;
  description?: string;
  canWrite?: boolean;
  /** The first page of items, unfiltered, as last shown. */
  items?: CollectionSketchItem[];
};

const STORAGE_KEY = `${REMEMBERED_SKELETON_KEY_PREFIX}collections`;
const MAX_SKETCHES = 50;

const readSketches = (): Record<string, CollectionSketch> => {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

/** The sketch of the collection as last shown, read once per collection. */
export const useCollectionSketch = (collectionId: CollectionId | undefined) =>
  useMemo(
    () =>
      collectionId == null ? null : (readSketches()[collectionId] ?? null),
    [collectionId],
  );

/** Merges what a part of the page shows into the collection's sketch. */
export const updateCollectionSketch = (
  collectionId: CollectionId,
  update: CollectionSketch,
) => {
  const sketches = readSketches();
  const key = String(collectionId);
  const sketch = { ...sketches[key], ...update };

  // Most recently shown last, so the oldest are the first to go
  delete sketches[key];
  sketches[key] = sketch;
  const keys = Object.keys(sketches);
  for (const staleKey of keys.slice(0, keys.length - MAX_SKETCHES)) {
    delete sketches[staleKey];
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sketches));
  } catch {
    // Storage full or unavailable: the next load draws the sample
  }
};

export const toCollectionSketchItems = (
  items: CollectionItem[],
): CollectionSketchItem[] =>
  items.map((item) => ({
    model: item.model,
    display: item.display,
    name: toSkeletonFiller(item.name),
    editor: item["last-edit-info"] && {
      first_name: toSkeletonFiller(item["last-edit-info"].first_name ?? ""),
      last_name: toSkeletonFiller(item["last-edit-info"].last_name ?? ""),
    },
  }));

// Any recent date: every date takes about as much room as another
const SKETCH_ITEM_TIMESTAMP = "2026-11-18T15:24:00Z";

/** Collection items to draw a sketch's rows from. */
export const getCollectionSketchItems = (
  sketchItems: CollectionSketchItem[],
): CollectionItem[] =>
  sketchItems.map(({ model, display, name, editor }, index) => ({
    id: -(index + 1),
    model,
    display,
    name,
    description: null,
    "last-edit-info": editor && {
      id: -1,
      email: "",
      ...editor,
      timestamp: SKETCH_ITEM_TIMESTAMP,
    },
  }));

export const getCollectionSketchHeader = (
  collection: Collection,
  isEditable: boolean,
): CollectionSketch => ({
  name: toSkeletonFiller(collection.name),
  isEditable,
  description: collection.description
    ? toSkeletonFiller(collection.description)
    : undefined,
  canWrite: collection.can_write,
});
