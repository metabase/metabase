import type {
  JevBestMatch,
  JevSearchRerankResult,
} from "metabase/api/jev-search";
import type { SearchResult, SearchResultId } from "metabase-types/api";

/** Natural-language requests start around here; short queries are usually literal names. */
export const JEV_MIN_WORDS = 3;

/**
 * Items that only came from widened recall (not the literal keyword match) are shown only when Jev
 * rates them at least "partially answers" on its 0..3 rubric. Keyword hits are always kept.
 */
export const JEV_RECALL_MIN_SCORE = 2;

const MAX_RECALL_TERMS = 3;

const STOPWORDS = new Set(
  (
    "a an and are as at be by can could did do does for from get give had has have how i in is it " +
    "its many me much my of on or our show tell that the their them there these this those to us " +
    "want was we were what when where which who why will with would you your make made last " +
    "about over each every most best any all some been into than then very just like need see find"
  ).split(" "),
);

export const countWords = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean).length;

export const isJevEligibleQuery = (text: string) =>
  countWords(text) >= JEV_MIN_WORDS;

/** The few most distinctive words of a request, each used as its own keyword search to widen recall. */
export const getRecallTerms = (text: string): string[] => {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  return [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_RECALL_TERMS);
};

const resultKey = ({ model, id }: { model: string; id: SearchResultId }) =>
  `${model}:${id}`;

export interface JevRanking {
  results: SearchResult[];
  best: JevBestMatch | null;
  elapsedMs: number;
}

/**
 * Reorders the candidate pool by Jev's ranking. Returns null when Jev had nothing to say, so the caller
 * keeps plain keyword order.
 */
export const applyJevRanking = ({
  pool,
  keywordCount,
  response,
}: JevSearchRerankResult): JevRanking | null => {
  if (response.status !== "ok") {
    return null;
  }
  const byKey = new Map(pool.map((result) => [resultKey(result), result]));
  const keywordKeys = new Set(pool.slice(0, keywordCount).map(resultKey));
  const bestKey = response.best ? resultKey(response.best) : null;

  const results: SearchResult[] = [];
  const placed = new Set<string>();
  for (const item of response.ranked) {
    const key = resultKey(item);
    const result = byKey.get(key);
    const keep =
      keywordKeys.has(key) ||
      key === bestKey ||
      (item.score ?? 0) >= JEV_RECALL_MIN_SCORE;
    if (result && keep && !placed.has(key)) {
      placed.add(key);
      results.push(result);
    }
  }
  // Keyword hits are never dropped, even if the server somehow omitted one.
  for (const result of pool.slice(0, keywordCount)) {
    if (!placed.has(resultKey(result))) {
      results.push(result);
    }
  }

  return {
    results,
    best: bestKey && placed.has(bestKey) ? response.best : null,
    elapsedMs: response.elapsed_ms,
  };
};

export const isJevBestMatch = (
  best: JevBestMatch | null,
  result: Pick<SearchResult, "model" | "id">,
) => best != null && resultKey(best) === resultKey(result);
