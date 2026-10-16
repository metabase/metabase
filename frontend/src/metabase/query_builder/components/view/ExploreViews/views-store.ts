import { useSyncExternalStore } from "react";
import _ from "underscore";

import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, CardId } from "metabase-types/api";

/** What a view shows: enough of a card to recreate it. */
export type ViewSnapshot = Pick<
  Card,
  "dataset_query" | "display" | "visualization_settings"
>;

export type ExploreViewKind = "records" | "suggested" | "session";

export type ExploreViewEntry = {
  id: string;
  kind: ExploreViewKind;
  title: string;
  /** The X-ray section a suggestion came from, like "Where these transactions happened". */
  section?: string;
  /** The view this one was changed from. */
  basedOn?: string;
  snapshot: ViewSnapshot;
  /** Identifies the query and shape, to recognize the view when it's on screen. */
  key: string;
  savedCardId?: CardId;
};

type ExploreViewsState = {
  sourceKey: string | null;
  entries: readonly ExploreViewEntry[];
  activeId: string | null;
  /** The view just picked, waiting for the query builder to show it. */
  pendingId: string | null;
};

let state: ExploreViewsState = {
  sourceKey: null,
  entries: [],
  activeId: null,
  pendingId: null,
};
const listeners = new Set<() => void>();

export function getViewsState(): ExploreViewsState {
  return state;
}

export function setViewsState(
  update: (state: ExploreViewsState) => ExploreViewsState,
) {
  state = update(state);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useExploreViews(): ExploreViewsState {
  return useSyncExternalStore(subscribe, getViewsState);
}

export function getActiveEntry(
  viewsState: ExploreViewsState,
): ExploreViewEntry | null {
  return (
    viewsState.entries.find((entry) => entry.id === viewsState.activeId) ?? null
  );
}

export function createEntryId(kind: ExploreViewKind): string {
  return _.uniqueId(`explore-view-${kind}-`);
}

/**
 * A key for the query and shape of a question. Clause ids are random, so they're left out;
 * settings sync after every run, so only the display counts.
 */
export function getViewKey(question: Question): string {
  const query = JSON.stringify(Lib.toJsQuery(question.query()), (key, value) =>
    key === "lib/uuid" ? undefined : value,
  );
  return `${query}|${question.display()}`;
}

export function getSnapshot(question: Question): ViewSnapshot {
  const card = question.card();
  return {
    dataset_query: card.dataset_query,
    display: card.display,
    visualization_settings: card.visualization_settings,
  };
}

/** The question a view shows, unsaved, with its shape kept as is. */
export function getSnapshotQuestion(
  question: Question,
  snapshot: ViewSnapshot,
): Question {
  return Question.create({
    metadata: question.metadata(),
    dataset_query: snapshot.dataset_query,
    visualization_settings: snapshot.visualization_settings,
  })
    .setDisplay(snapshot.display)
    .lockDisplay();
}
