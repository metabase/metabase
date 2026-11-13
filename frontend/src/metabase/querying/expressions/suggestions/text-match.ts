import Fuse from "fuse.js";

import type { ExpressionSuggestion } from "./types";

// Scores, from 0 for the best match. The order of the kinds of match is the
// one of the filters prototype, with a prefix first, as code completion does.
const EXACT_SCORE = 0;
const PREFIX_SCORE = 0.01;
const ALIAS_SCORE = 0.02;
const WORD_PREFIX_SCORE = 0.03;
// An abbreviation, like "ltv" for "Lifetime Value". It comes before a match
// in the middle of a word, which is often an accident for short searches.
const ABBREVIATION_SCORE = 0.04;
const SUBSTRING_SCORE = 0.05;
const ALIAS_PREFIX_SCORE = 0.1;
// One typo or one swap of two letters at the start of a word.
const ONE_EDIT_SCORE = 0.2;

const MIN_FUZZY_SEARCH_LENGTH = 3;
// Stricter than the filters prototype: the list mixes columns and functions,
// and loose matches of one kind push out real matches of the other.
const FUZZY_THRESHOLD = 0.2;
const MIN_LOOSE_SEARCH_LENGTH = 4;
const MIN_ABBREVIATION_LENGTH = 2;
const MAX_ABBREVIATION_LENGTH = 6;

type Match = {
  score: number;
  matches?: [number, number][];
  /** Why the option matches, when its label does not show it. */
  hint?: string;
};

function getLabel(option: ExpressionSuggestion) {
  return option.displayLabel ?? option.label;
}

/**
 * The options that match the search, best first, with the matched parts of
 * their labels. It matches aliases, abbreviations and typos, like the column
 * search of the filters prototype.
 */
export function matchOptions(
  options: ExpressionSuggestion[],
  search: string,
): ExpressionSuggestion[] {
  const searchText = search.trim().toLowerCase();
  if (searchText === "") {
    return options;
  }
  const results = new Map<ExpressionSuggestion, Match>();
  for (const option of options) {
    const match = getTextMatch(option, searchText);
    if (match != null) {
      results.set(option, match);
    }
  }
  // Typos and loose matches only when nothing matches better, because they
  // bring in unrelated options.
  if (searchText.length >= MIN_LOOSE_SEARCH_LENGTH && results.size === 0) {
    for (const option of options) {
      const distance = getOneEditWordDistance(getLabel(option), searchText);
      if (distance != null) {
        // The closer the whole word, the better: "coupn" is "Coupon", not
        // "Country".
        results.set(option, { score: ONE_EDIT_SCORE + distance / 100 });
      }
    }
  }
  if (searchText.length >= MIN_LOOSE_SEARCH_LENGTH && results.size === 0) {
    const fuse = new Fuse(options, {
      keys: ["displayLabel", "label"],
      threshold: FUZZY_THRESHOLD,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true,
    });
    for (const result of fuse.search(searchText)) {
      if (!results.has(result.item)) {
        results.set(result.item, {
          score: result.score ?? 1,
          matches: result.matches?.[0]?.indices.map(
            ([start, end]): [number, number] => [start, end],
          ),
        });
      }
    }
  }
  return [...results.entries()]
    .sort(([, a], [, b]) => a.score - b.score)
    .map(([option, { matches, hint }]) => ({ ...option, matches, hint }));
}

function getTextMatch(
  option: ExpressionSuggestion,
  searchText: string,
): Match | null {
  const label = getLabel(option).toLowerCase();
  const range = (start: number): [number, number][] => [
    [start, start + searchText.length - 1],
  ];
  if (label === searchText) {
    return { score: EXACT_SCORE, matches: range(0) };
  }
  if (label.startsWith(searchText)) {
    return { score: PREFIX_SCORE, matches: range(0) };
  }
  const aliases = option.aliases ?? [];
  const exactAlias = aliases.find((alias) => alias === searchText);
  if (exactAlias != null) {
    return { score: ALIAS_SCORE, hint: exactAlias };
  }
  const wordStart = label.search(
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(searchText)}`),
  );
  if (wordStart >= 0) {
    const start = label.indexOf(searchText, wordStart);
    return { score: WORD_PREFIX_SCORE, matches: range(start) };
  }
  if (isAbbreviation(getLabel(option), searchText)) {
    return { score: ABBREVIATION_SCORE };
  }
  const index = label.indexOf(searchText);
  if (index >= 0) {
    return { score: SUBSTRING_SCORE, matches: range(index) };
  }
  const prefixAlias = aliases.find((alias) => alias.startsWith(searchText));
  if (prefixAlias != null) {
    return { score: ALIAS_PREFIX_SCORE, hint: prefixAlias };
  }
  return null;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words of a label, with camelCase split, like "dayName" to "day", "name". */
function getWords(label: string) {
  return label
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

/**
 * True when the search text abbreviates 2 or more words in a row of the label.
 * Each word gives the search text its first letter, and maybe more letters of
 * the word in order. Examples: "ltv" for "Lifetime Value", "dtd" for
 * "datetimeDiff".
 */
function isAbbreviation(label: string, searchText: string) {
  if (
    searchText.length < MIN_ABBREVIATION_LENGTH ||
    searchText.length > MAX_ABBREVIATION_LENGTH ||
    !/^[a-z0-9]+$/.test(searchText)
  ) {
    return false;
  }
  const words = getWords(label);
  return words.some((_, start) => matchesWords(words, start, searchText, 0));
}

/**
 * True when `text` abbreviates the words from `wordIndex` on, and covers at
 * least 2 words. The first letter of `text` must start the word.
 */
function matchesWords(
  words: string[],
  wordIndex: number,
  text: string,
  matchedWordCount: number,
): boolean {
  if (text.length === 0) {
    return matchedWordCount >= 2;
  }
  const word = words[wordIndex];
  if (word == null || word[0] !== text[0]) {
    return false;
  }
  // The word takes its first letter and then a subsequence of its other
  // letters: try each length of the part of `text` that this word takes.
  let position = 1;
  for (let taken = 1; taken <= text.length; taken++) {
    if (
      matchesWords(
        words,
        wordIndex + 1,
        text.slice(taken),
        matchedWordCount + 1,
      )
    ) {
      return true;
    }
    const next = text[taken];
    if (next == null) {
      return false;
    }
    position = word.indexOf(next, position);
    if (position === -1) {
      return false;
    }
    position++;
  }
  return false;
}

/**
 * True when the start of a word of the label is the search text with one
 * typo, one missing or extra letter, or two letters swapped, like "emial" for
 * "Email". Fuse scores a swap as two errors, which is too many for short words.
 */
function getOneEditWordDistance(label: string, searchText: string) {
  const distances = getWords(label)
    .filter(
      (word) =>
        word.length >= MIN_FUZZY_SEARCH_LENGTH &&
        [-1, 0, 1].some(
          (lengthChange) =>
            getEditDistance(
              word.slice(0, searchText.length + lengthChange),
              searchText,
            ) <= 1,
        ),
    )
    .map((word) => getEditDistance(word, searchText));
  return distances.length > 0 ? Math.min(...distances) : null;
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
