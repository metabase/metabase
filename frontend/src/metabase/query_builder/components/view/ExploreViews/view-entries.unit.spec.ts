import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";

import { getExploreSuggestions } from "../ExploreBar/suggestions";

import { getViewTitle, syncViews, withSuggestions } from "./view-entries";
import {
  type ExploreViewEntry,
  getActiveEntry,
  getSnapshot,
  getViewKey,
} from "./views-store";

const STAGE_INDEX = -1;

type ViewsState = Parameters<typeof syncViews>[0];

const EMPTY_STATE: ViewsState = {
  sourceKey: null,
  entries: [],
  activeId: null,
  pendingId: null,
};

function createRecordsQuestion() {
  return Question.create({ metadata: SAMPLE_METADATA }).setQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  );
}

function applyText(question: Question, text: string): Question {
  const query = question.query();
  const [suggestion] = getExploreSuggestions(
    { query, stageIndex: STAGE_INDEX },
    text,
  );
  if (suggestion?.apply == null) {
    throw new Error(`Nothing to apply for "${text}"`);
  }
  return question.setQuery(suggestion.apply(query));
}

function createSuggestion(question: Question, title: string): ExploreViewEntry {
  return {
    id: `suggested-${title}`,
    kind: "suggested",
    title,
    section: "Overview",
    snapshot: getSnapshot(question),
    key: getViewKey(question),
  };
}

function getTitles(state: ViewsState, kind: ExploreViewEntry["kind"]) {
  return state.entries
    .filter((entry) => entry.kind === kind)
    .map((entry) => entry.title);
}

describe("syncViews", () => {
  it("starts on the records of a newly opened table", () => {
    const state = syncViews(EMPTY_STATE, createRecordsQuestion());
    expect(getTitles(state, "records")).toEqual(["Records"]);
    expect(getActiveEntry(state)?.kind).toBe("records");
  });

  it("starts a temporary view on the first change, and updates it after that", () => {
    const records = createRecordsQuestion();
    const opened = syncViews(EMPTY_STATE, records);

    const byMonth = applyText(records, "count by month");
    const edited = syncViews(opened, byMonth);
    expect(getTitles(edited, "session")).toEqual([
      "Count by Created At: Month",
    ]);
    expect(getActiveEntry(edited)).toMatchObject({
      kind: "session",
      basedOn: "Records",
    });

    const narrowed = applyText(byMonth, "last 30 days");
    const editedAgain = syncViews(edited, narrowed);
    expect(getTitles(editedAgain, "session")).toEqual([
      "Count by Created At: Month, Created At is in the previous 30 days",
    ]);
  });

  it("shows a picked suggestion as is, and forks it when it's changed", () => {
    const records = createRecordsQuestion();
    const byState = applyText(records, "count by state");
    const suggestion = createSuggestion(byState, "Sales per state");
    const opened = withSuggestions(syncViews(EMPTY_STATE, records), [
      suggestion,
    ]);

    const picked = syncViews({ ...opened, pendingId: suggestion.id }, byState);
    expect(getActiveEntry(picked)?.title).toBe("Sales per state");
    expect(getTitles(picked, "session")).toEqual([]);

    const changed = syncViews(picked, applyText(byState, "total over 50"));
    expect(getActiveEntry(changed)).toMatchObject({
      kind: "session",
      basedOn: "Sales per state",
    });
    expect(getTitles(changed, "suggested")).toEqual(["Sales per state"]);
  });

  it("keeps the saved name once the temporary view is saved", () => {
    const records = createRecordsQuestion();
    const byMonth = applyText(records, "count by month");
    const edited = syncViews(syncViews(EMPTY_STATE, records), byMonth);

    const saved = byMonth.setCard({
      ...byMonth.card(),
      id: 42,
      name: "Orders per month",
    });
    const afterSave = syncViews(edited, saved);
    expect(getActiveEntry(afterSave)).toMatchObject({
      title: "Orders per month",
      savedCardId: 42,
    });
  });
});

describe("getViewTitle", () => {
  it("names the summary, then how it's narrowed", () => {
    const question = applyText(
      applyText(createRecordsQuestion(), "sum of total by state"),
      "total over 50",
    );
    expect(getViewTitle(question)).toBe(
      "Sum of Total by User → State, Total is greater than 50",
    );
  });
});
