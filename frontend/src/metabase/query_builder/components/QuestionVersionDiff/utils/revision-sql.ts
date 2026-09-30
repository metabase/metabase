import type { Revision } from "metabase-types/api";

/**
 * The query of a card at a given revision, as far as the SQL diff is concerned.
 * - `native`: a native query with its raw SQL text
 * - `not-native`: a GUI (MBQL) query, which the SQL diff cannot show
 * - `unknown`: the revision data does not contain enough information
 */
export type RevisionQuery =
  | { type: "native"; sql: string }
  | { type: "not-native" }
  | { type: "unknown" };

export interface QuestionVersion {
  revision: Revision;
  /** 1-based, chronological among the revisions the backend still keeps */
  versionNumber: number;
  query: RevisionQuery;
}

const NATIVE_STAGE_TYPE = "mbql.stage/native";
const UNKNOWN_QUERY: RevisionQuery = { type: "unknown" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the query state out of a `dataset_query` value. Works both for a full
 * `dataset_query` (e.g. from `GET /api/card/:id`) and for the partial fragments
 * the revision API returns in `diff.before` / `diff.after`.
 *
 * Revision diffs are produced by `clojure.data/diff`, so a fragment contains
 * only the keys that changed; vectors are diffed by position, with `null` in
 * positions that did not change. Strings are compared as a whole, so a changed
 * SQL string is always present in full.
 *
 * Returns `undefined` when the value says nothing about the query text.
 */
export function getQueryFromDatasetQuery(
  datasetQuery: unknown,
): RevisionQuery | undefined {
  if (!isRecord(datasetQuery)) {
    return undefined;
  }

  // MBQL 5 (persisted by Metabase since v57)
  const { stages } = datasetQuery;
  if (Array.isArray(stages)) {
    const [firstStage] = stages;
    if (!isRecord(firstStage)) {
      return undefined;
    }
    if (typeof firstStage.native === "string") {
      return { type: "native", sql: firstStage.native };
    }
    const stageType = firstStage["lib/type"];
    if (typeof stageType === "string" && stageType !== NATIVE_STAGE_TYPE) {
      return { type: "not-native" };
    }
    return undefined;
  }

  // Legacy MBQL
  const { native, type } = datasetQuery;
  if (isRecord(native) && typeof native.query === "string") {
    return { type: "native", sql: native.query };
  }
  if (type === "query") {
    return { type: "not-native" };
  }
  return undefined;
}

function getQueryFromDiffSide(
  revision: Revision,
  side: "before" | "after",
): RevisionQuery | undefined {
  // Card revision diffs are `{ before, after }` with partial card objects
  const diff: unknown = revision.diff;
  const cardFragment = isRecord(diff) ? diff[side] : undefined;
  if (!isRecord(cardFragment)) {
    return undefined;
  }
  return getQueryFromDatasetQuery(cardFragment.dataset_query);
}

/**
 * Rebuilds the query of every revision of a card.
 *
 * The revision API does not return the full revision objects, only a diff
 * against the previous revision. We walk the revisions from newest to oldest:
 * a revision's `diff.after` holds its query if the query changed in that
 * revision, and its `diff.before` holds the query of the previous revision.
 * The newest known query (or `currentDatasetQuery` when no revision ever
 * changed the query) anchors the walk.
 *
 * @param revisions revisions as returned by `GET /api/revision`, in any order
 * @param currentDatasetQuery the saved card's `dataset_query`
 * @returns versions ordered from newest to oldest
 */
export function getQuestionVersions(
  revisions: Revision[],
  currentDatasetQuery?: unknown,
): QuestionVersion[] {
  const newestFirst = [...revisions].sort((a, b) => b.id - a.id);

  const newestChangedQuery = newestFirst
    .map((revision) => getQueryFromDiffSide(revision, "after"))
    .find((query) => query !== undefined);

  let query: RevisionQuery =
    newestChangedQuery ??
    getQueryFromDatasetQuery(currentDatasetQuery) ??
    UNKNOWN_QUERY;

  return newestFirst.map((revision, index) => {
    const queryAtRevision = getQueryFromDiffSide(revision, "after") ?? query;
    query = getQueryFromDiffSide(revision, "before") ?? queryAtRevision;

    return {
      revision,
      versionNumber: newestFirst.length - index,
      query: queryAtRevision,
    };
  });
}

export function getVersionSql(version: QuestionVersion): string | null {
  return version.query.type === "native" ? version.query.sql : null;
}

/**
 * Picks a sensible default pair to compare: the newest version against the
 * closest older version whose SQL differs (falling back to the previous one).
 */
export function getDefaultComparison(
  versions: QuestionVersion[],
): { oldVersion: QuestionVersion; newVersion: QuestionVersion } | null {
  const [newVersion, ...olderVersions] = versions;
  if (!newVersion || olderVersions.length === 0) {
    return null;
  }

  const newSql = getVersionSql(newVersion);
  const oldVersion =
    olderVersions.find((version) => {
      const sql = getVersionSql(version);
      return sql !== null && sql !== newSql;
    }) ?? olderVersions[0];

  return { oldVersion, newVersion };
}
