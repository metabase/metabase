import Fuse from "fuse.js";

import type { SuggestionGroup, SuggestionOption } from "./types";

const MIN_FUZZY_SEARCH_LENGTH = 3;
const FUZZY_THRESHOLD = 0.35;
// A score for one typo or one swap of two letters at the start of a word.
const ONE_EDIT_SCORE = 0.2;

/** A score for an option that the search shows for another reason. */
export const UNSCORED = 1;

/**
 * Prototype: scores of the options that match the search, from 0 for the best
 * match. An option whose label or description has the search text gets 0.
 * Other options match with typos and missing letters, for searches of 3 or
 * more characters.
 */
export function getOptionScores(
  groups: SuggestionGroup[],
  searchText: string,
): Map<string, number> {
  const options = groups
    .filter((group) => !group.isUnfiltered)
    .flatMap((group) => group.options);
  const scores = new Map<string, number>();
  for (const option of options) {
    const aliasScore = getAliasScore(option, searchText);
    if (aliasScore != null) {
      scores.set(option.value, aliasScore);
    } else if (hasText(option, searchText)) {
      scores.set(option.value, 0);
    }
  }
  if (searchText.length >= MIN_FUZZY_SEARCH_LENGTH) {
    for (const option of options) {
      if (!scores.has(option.value) && hasOneEditWord(option, searchText)) {
        scores.set(option.value, ONE_EDIT_SCORE);
      }
    }
    const fuse = new Fuse(options, {
      keys: ["label", "description"],
      threshold: FUZZY_THRESHOLD,
      ignoreLocation: true,
      includeScore: true,
    });
    for (const result of fuse.search(searchText)) {
      if (!scores.has(result.item.value)) {
        scores.set(result.item.value, result.score ?? UNSCORED);
      }
    }
  }
  return scores;
}

// An exact alias is the best match. An alias that starts with the search, like
// ">=" for ">", comes after it.
const ALIAS_PREFIX_SCORE = 0.1;

function getAliasScore(option: SuggestionOption, searchText: string) {
  const aliases = option.aliases ?? [];
  if (aliases.includes(searchText)) {
    return 0;
  }
  return searchText.length > 0 &&
    aliases.some((alias) => alias.startsWith(searchText))
    ? ALIAS_PREFIX_SCORE
    : undefined;
}

function hasText(option: SuggestionOption, searchText: string) {
  return (
    option.label.toLowerCase().includes(searchText) ||
    (option.description?.toLowerCase().includes(searchText) ?? false)
  );
}

/**
 * True when the start of a word of the label is the search text with one
 * typo, one missing or extra letter, or two letters swapped, like "emial" for
 * "Email". Fuse scores a swap as two errors, which is too many for short words.
 */
function hasOneEditWord(option: SuggestionOption, searchText: string) {
  return option.label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some(
      (word) =>
        word.length >= MIN_FUZZY_SEARCH_LENGTH &&
        [-1, 0, 1].some(
          (lengthChange) =>
            getEditDistance(
              word.slice(0, searchText.length + lengthChange),
              searchText,
            ) <= 1,
        ),
    );
}

/** The optimal string alignment distance: edits, where a swap is one edit. */
function getEditDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}
