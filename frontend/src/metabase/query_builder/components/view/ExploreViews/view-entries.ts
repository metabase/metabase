import { t } from "ttag";

import { isVirtualDashCard } from "metabase/utils/dashboard";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

import { getAdHocQuestionDescription } from "../ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";

import {
  type ExploreViewEntry,
  createEntryId,
  getActiveEntry,
  getSnapshot,
  getSnapshotQuestion,
  getViewKey,
} from "./views-store";

const STAGE_INDEX = -1;
const MAX_FILTERS_IN_TITLE = 2;

type ViewsState = {
  sourceKey: string | null;
  entries: readonly ExploreViewEntry[];
  activeId: string | null;
  pendingId: string | null;
};

/** The table or saved question the views are about; views reset when it changes. */
export function getSourceKey(question: Question): string | null {
  const sourceId = Lib.sourceTableOrCardId(question.query());
  return sourceId != null ? String(sourceId) : null;
}

/** "Count by Category, Category is Gadget": what the view summarizes, then how it's narrowed. */
export function getViewTitle(question: Question): string {
  const query = question.query();
  const summary = getAdHocQuestionDescription({ question }) || t`Records`;
  const filterLabels = Lib.filters(query, STAGE_INDEX).map(
    (filter) => Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
  );
  if (filterLabels.length === 0) {
    return summary;
  }
  const shownFilters = filterLabels.slice(0, MAX_FILTERS_IN_TITLE).join(", ");
  const moreCount = filterLabels.length - MAX_FILTERS_IN_TITLE;
  return moreCount > 0
    ? t`${summary}, ${shownFilters} and ${moreCount} more`
    : t`${summary}, ${shownFilters}`;
}

/** Every row of the source table or question, with nothing applied. */
export function getRecordsEntry(question: Question): ExploreViewEntry | null {
  const query = question.query();
  const sourceId = Lib.sourceTableOrCardId(query);
  if (sourceId == null) {
    return null;
  }
  const provider = Lib.metadataProvider(
    Lib.databaseID(query),
    question.metadata(),
  );
  const source = Lib.tableOrCardMetadata(provider, sourceId);
  if (source == null) {
    return null;
  }
  const recordsQuestion = question
    .setQuery(Lib.queryFromTableOrCardMetadata(provider, source))
    .setDisplay("table")
    .setSettings({});
  return {
    id: createEntryId("records"),
    kind: "records",
    title: t`Records`,
    snapshot: getSnapshot(recordsQuestion),
    key: getViewKey(recordsQuestion),
  };
}

/** The X-ray's cards for the source, as suggested views under the X-ray's own section titles. */
export function getXrayEntries(
  question: Question,
  dashboard: Dashboard,
): ExploreViewEntry[] {
  const dashcards = [...dashboard.dashcards].sort(
    (a, b) => a.row - b.row || a.col - b.col,
  );
  let section: string | undefined;
  return dashcards.flatMap((dashcard): ExploreViewEntry[] => {
    if (isVirtualDashCard(dashcard)) {
      const text = dashcard.visualization_settings.text;
      if (typeof text === "string" && text.trim().length > 0) {
        section = text.replace(/^#+\s*/, "").trim();
      }
      return [];
    }
    const { card } = dashcard;
    if (card == null || card.dataset_query == null) {
      return [];
    }
    const snapshot = {
      dataset_query: card.dataset_query,
      display: card.display,
      visualization_settings: {
        ...card.visualization_settings,
        ...dashcard.visualization_settings,
      },
    };
    return [
      {
        id: createEntryId("suggested"),
        kind: "suggested",
        title: card.name,
        section,
        snapshot,
        key: getViewKey(getSnapshotQuestion(question, snapshot)),
      },
    ];
  });
}

/** The views for a newly opened source: its records, and what was opened if it's something else. */
function getInitialState(question: Question): ViewsState {
  const records = getRecordsEntry(question);
  const key = getViewKey(question);
  const isRecords = records != null && records.key === key;
  const opened: ExploreViewEntry | null = isRecords
    ? null
    : {
        id: createEntryId("session"),
        kind: "session",
        title: question.isSaved()
          ? (question.displayName() ?? getViewTitle(question))
          : getViewTitle(question),
        snapshot: getSnapshot(question),
        key,
        savedCardId: question.isSaved() ? question.id() : undefined,
      };
  return {
    sourceKey: getSourceKey(question),
    entries: [...(records ? [records] : []), ...(opened ? [opened] : [])],
    activeId: opened?.id ?? records?.id ?? null,
    pendingId: null,
  };
}

/**
 * Keeps the views in step with the question on screen. Picking a view shows it as is; any other
 * change to the view on screen is an edit: the first edit of a view starts a new temporary view
 * based on it, and later edits update that temporary view until it's saved.
 */
export function syncViews(state: ViewsState, question: Question): ViewsState {
  const sourceKey = getSourceKey(question);
  if (sourceKey !== state.sourceKey) {
    return getInitialState(question);
  }

  const key = getViewKey(question);
  if (state.pendingId != null) {
    // a picked view may come back slightly normalized; remember it the way it's shown
    return {
      ...state,
      activeId: state.pendingId,
      pendingId: null,
      entries: state.entries.map((entry) =>
        entry.id === state.pendingId ? { ...entry, key } : entry,
      ),
    };
  }

  const active = getActiveEntry(state);
  if (active?.key === key) {
    return withSavedActive(state, question);
  }

  const matching = state.entries.find((entry) => entry.key === key);
  if (matching != null) {
    return { ...state, activeId: matching.id };
  }

  const isUnsavedEdit =
    active?.kind === "session" && active.savedCardId == null;
  if (active != null && isUnsavedEdit) {
    return withSavedActive(
      {
        ...state,
        entries: state.entries.map((entry) =>
          entry.id === active.id
            ? {
                ...entry,
                title: getViewTitle(question),
                snapshot: getSnapshot(question),
                key,
              }
            : entry,
        ),
      },
      question,
    );
  }

  const edited: ExploreViewEntry = {
    id: createEntryId("session"),
    kind: "session",
    title: getViewTitle(question),
    basedOn: active?.title,
    snapshot: getSnapshot(question),
    key,
  };
  return {
    ...state,
    entries: [...state.entries, edited],
    activeId: edited.id,
  };
}

/** Once the question on screen is saved, its view keeps the saved name and stops changing. */
function withSavedActive(state: ViewsState, question: Question): ViewsState {
  const active = getActiveEntry(state);
  if (active == null || active.kind !== "session" || !question.isSaved()) {
    return state;
  }
  const cardId = question.id();
  if (active.savedCardId === cardId) {
    return state;
  }
  return {
    ...state,
    entries: state.entries.map((entry) =>
      entry.id === active.id
        ? {
            ...entry,
            title: question.displayName() ?? entry.title,
            savedCardId: cardId,
          }
        : entry,
    ),
  };
}

/** Puts the X-ray's suggestions in, replacing earlier ones for the same source. */
export function withSuggestions(
  state: ViewsState,
  suggestions: ExploreViewEntry[],
): ViewsState {
  return {
    ...state,
    entries: [
      ...state.entries.filter((entry) => entry.kind !== "suggested"),
      ...suggestions,
    ],
  };
}
