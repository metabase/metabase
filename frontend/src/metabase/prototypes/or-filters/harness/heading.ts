import * as Lib from "metabase-lib";

/** What the question header shows. */
export type QuestionHeading = {
  title: string;
  /** The saved name, once the query no longer matches it. */
  startedFrom?: string;
};

/** A loaded example's saved name and the query it was saved with. */
export type SavedQuestion = { title: string; query: Lib.Query };

/** The saved name while the query is untouched, then the generated one, "started from" the saved. */
export function getHeading(
  query: Lib.Query,
  saved: SavedQuestion | undefined,
): QuestionHeading {
  if (saved && saved.query === query) {
    return { title: saved.title };
  }
  return { title: Lib.suggestedName(query), startedFrom: saved?.title };
}
