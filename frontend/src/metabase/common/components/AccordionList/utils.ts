import { shallowEqual } from "@mantine/hooks";
import Fuse from "fuse.js";
import { getIn } from "icepick";
import { type ReactNode, isValidElement } from "react";
import { isFragment } from "react-is";

import type { Item, Row, SearchProps, Section } from "./types";

// The threshold for the score of search results
// when fuzzy searching. 0 is a perfect match, 1 is the
// worst possible match.
const SEARCH_SCORE_THRESHOLD = 0.4;

export type Cursor = {
  sectionIndex: number;
  itemIndex: number | null;
};

type SectionPredicate = (sectionIndex: number) => boolean;

const areSameCursors = (left: Cursor, right: Cursor) => {
  return (
    left.itemIndex === right.itemIndex &&
    left.sectionIndex === right.sectionIndex
  );
};

function getCursorForRow<TItem extends Item, TSection extends Section<TItem>>(
  row: Row<TItem, TSection>,
) {
  return {
    sectionIndex: row.sectionIndex,
    itemIndex: row.type === "item" ? row.itemIndex : null,
  };
}

export function getNextCursor<
  TItem extends Item,
  TSection extends Section<TItem>,
>(
  cursor: Cursor | null,
  rows: Row<TItem, TSection>[],
  canSelectSection: SectionPredicate,
  skipInitial: boolean = true,
): Cursor | null {
  if (!cursor) {
    const firstRow = rows.find(
      (row) =>
        row.type !== "search" &&
        row.type !== "no-results" &&
        (row.type === "item" || canSelectSection(row.sectionIndex)),
    );
    if (!firstRow) {
      return null;
    }
    return getNextCursor(
      getCursorForRow(firstRow),
      rows,
      canSelectSection,
      false,
    );
  }

  const currentRowIndex = rows.findIndex((row) =>
    areSameCursors(cursor, getCursorForRow(row)),
  );

  for (let rowIndex = currentRowIndex; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    const rowCursor = getCursorForRow(row);

    if (!skipInitial || areSameCursors(cursor, rowCursor)) {
      continue;
    }

    if (row.type === "item" || canSelectSection(rowCursor.sectionIndex)) {
      return rowCursor;
    }
  }

  return cursor;
}

export function getPrevCursor<
  TItem extends Item,
  TSection extends Section<TItem>,
>(
  cursor: Cursor | null,
  rows: Row<TItem, TSection>[],
  canSelectSection: SectionPredicate,
): Cursor | null {
  if (!cursor) {
    const firstRow = rows.find(
      (row) =>
        row.type !== "search" &&
        row.type !== "no-results" &&
        (row.type === "item" || canSelectSection(row.sectionIndex)),
    );
    if (!firstRow) {
      return null;
    }
    return getPrevCursor(getCursorForRow(firstRow), rows, canSelectSection);
  }

  const currentRowIndex = rows.findIndex((row) =>
    areSameCursors(cursor, getCursorForRow(row)),
  );

  for (let rowIndex = currentRowIndex; rowIndex >= 0; rowIndex--) {
    const row = rows[rowIndex];
    const rowCursor = getCursorForRow(row);

    if (areSameCursors(cursor, rowCursor)) {
      continue;
    }

    if (row.type === "item" || canSelectSection(rowCursor.sectionIndex)) {
      return rowCursor;
    }
  }

  return cursor;
}

export function isReactNode(x: unknown): x is ReactNode {
  return (
    isValidElement(x) ||
    isFragment(x) ||
    typeof x === "string" ||
    typeof x === "number" ||
    x === null ||
    x === undefined
  );
}

type FilterOptions<TItem extends Item, TSection extends Section<TItem>> = {
  sections: TSection[];
  searchProp?: SearchProps<TItem>;
  fuzzySearch?: boolean;
  searchText: string;
};

type SearchOptions<TItem extends Item> = {
  items: TItem[];
  searchProp: SearchProps<TItem>;
  searchText: string;
};

type SearchStrategy<TItem extends Item> = (
  options: SearchOptions<TItem>,
) => ItemScores<TItem>;

type ItemScores<TItem extends Item> = {
  threshold: number;
  score(item: TItem): number;
};

export function searchFilter<
  TItem extends Item,
  TSection extends Section<TItem>,
>({
  sections,
  searchText,
  searchProp = ["name", "displayName"] as unknown as SearchProps<TItem>,
  fuzzySearch = false,
}: FilterOptions<TItem, TSection>) {
  const strategy = searchStrategy({
    sections,
    searchText,
    searchProp,
    fuzzySearch,
  });
  const items = getSearchItems<TItem, TSection>(sections);
  const scores = strategy({ items, searchText, searchProp });

  return sortAndFilterSections(sections, scores);
}

const getSearchItems = memoize(function <
  TItem extends Item,
  TSection extends Section<TItem>,
>(sections: TSection[]): TItem[] {
  return sections.flatMap((section) => section.items ?? []);
});

/**
 * searchStrategy picks the correct SearchStrategy based on the
 * search options.
 */
function searchStrategy<TItem extends Item, TSection extends Section<TItem>>({
  searchText,
  fuzzySearch,
}: FilterOptions<TItem, TSection>): SearchStrategy<TItem> {
  if (searchText === "") {
    return alwaysMatch;
  } else if (fuzzySearch) {
    return searchFuzzy;
  } else {
    return searchSubstring;
  }
}

/**
 * alwaysMatch is a SearchStrategy that returns all the items with a score of 0.
 * It performs no work to see if an item acutally matches the search text.
 */
const alwaysMatch = function <TItem extends Item>(): ItemScores<TItem> {
  return {
    threshold: Infinity,
    score(_item: TItem) {
      return 0;
    },
  };
};

/**
 * searchFuzzy is a SearchStrategy that use Fuse.js to perform fuzzy search.
 */
const searchFuzzy = memoize(function <TItem extends Item>({
  items,
  searchText,
  searchProp,
}: SearchOptions<TItem>): ItemScores<TItem> {
  const searchIndex = getFuzzySearchIndex({ items, searchProp });
  const results = searchIndex.search(searchText, { limit: 50 });

  const scores = new Map<TItem, number>();
  for (const result of results) {
    scores.set(result.item, result.score ?? 1);
  }
  return {
    threshold: SEARCH_SCORE_THRESHOLD,
    score(item: TItem) {
      return scores.get(item) ?? 1;
    },
  };
});

/**
 * searchSubstring is a SearchStrategy that performs a simple (lowercase) substring
 * search.
 */
const searchSubstring = memoize(function <TItem extends Item>({
  searchText,
  searchProp,
}: SearchOptions<TItem>): ItemScores<TItem> {
  const searchProps = Array.isArray(searchProp) ? searchProp : [searchProp];
  return {
    threshold: SEARCH_SCORE_THRESHOLD,
    score(item: TItem) {
      let score = 1;
      for (const prop of searchProps) {
        const path = prop.split(".");
        const itemText = String(getIn(item, path) || "");
        const match = itemText.toLowerCase().includes(searchText.toLowerCase());
        score = Math.min(score, match ? 0 : 1);
      }
      return score;
    },
  };
});

function sortAndFilterSections<
  TItem extends Item,
  TSection extends Section<TItem>,
>(sections: TSection[], scores: ItemScores<TItem>) {
  return sections
    .map((section, sectionIndex) => {
      const sectionScores = (section.items ?? []).map(scores.score);
      const sectionScore = Math.min(1, ...sectionScores);

      const items = sortAndFilterItems(section.items ?? [], scores);

      return {
        section,
        sectionScore,
        sectionIndex,
        items,
      };
    })
    .filter(
      ({ sectionScore, section }) =>
        section.type || sectionScore < scores.threshold,
    )
    .sort((a, b) => {
      if (a.section.alwaysSortLast && b.section.alwaysSortLast) {
        return 0;
      }
      if (a.section.alwaysSortLast) {
        return 1;
      }
      if (b.section.alwaysSortLast) {
        return -1;
      }
      return a.sectionScore - b.sectionScore;
    });
}

function sortAndFilterItems<TItem extends Item>(
  items: TItem[],
  scores: ItemScores<Item>,
) {
  return items
    .map((item, itemIndex) => ({
      item,
      itemIndex,
      itemScore: scores.score(item),
    }))
    .filter(({ itemScore }) => itemScore < scores.threshold)
    .sort((a, b) => a.itemScore - b.itemScore);
}

/**
 * Build the Fuse.js index for fuzzy search.
 *
 * This is memoized to avoid rebuilding the index for every keystroke.
 */
const getFuzzySearchIndex = memoize(function <TItem extends Item>({
  items,
  searchProp,
}: {
  items: TItem[];
  searchProp: SearchProps<TItem>;
}) {
  const keys = Array.isArray(searchProp) ? searchProp : [searchProp];
  return new Fuse<TItem>(items, {
    keys,
    includeScore: true,
    isCaseSensitive: false,
  });
});

/**
 * Memoizes a function based on shallow equality of its argument.
 *
 * This basically acts as a LRU cache with just one cache entry.
 *
 * We use this over _.memoize because we rely on object identiy to memoize
 * the search index, and _.memoize use string hashing for equality.
 */
function memoize<T extends object, R>(fn: (t: T) => R): (t: T) => R {
  let lastArgs: T | null = null;
  let lastResult: R | null = null;

  return function (args: T): R {
    if (
      lastArgs == null ||
      lastResult == null ||
      !shallowEqual(lastArgs, args)
    ) {
      lastArgs = args;
      lastResult = fn(args);
    }
    return lastResult;
  };
}
