import { shallowEqual } from "@mantine/hooks";
import Fuse from "fuse.js";
import { getIn } from "icepick";
import { type ReactNode, isValidElement } from "react";
import { isFragment } from "react-is";

import type { Item, Row, SearchProps, Section } from "./types";

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

export function getNextCursor<
  TItem extends Item,
  TSection extends Section<TItem>,
>(
  cursor: Cursor | null,
  rows: Row<TItem, TSection>[],
  isSectionExpanded: SectionPredicate,
  canSelectSection: SectionPredicate,
  skipInitial: boolean = true,
): Cursor {
  if (!cursor) {
    return getNextCursor(
      { sectionIndex: 0, itemIndex: null },
      rows,
      isSectionExpanded,
      canSelectSection,
      false,
    );
  }

  const currentRowIndex = rows.findIndex(
    (row) =>
      row.sectionIndex === cursor.sectionIndex &&
      ((row.type === "item" && row.itemIndex === cursor.itemIndex) ||
        cursor.itemIndex == null),
  );

  for (let rowIndex = currentRowIndex; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const { section, sectionIndex } = row;

    const sectionCursor = {
      sectionIndex,
      itemIndex: null,
    };

    const skipSectionItem =
      cursor.sectionIndex === sectionIndex && cursor.itemIndex != null;

    if (
      !skipSectionItem &&
      (!skipInitial || !areSameCursors(cursor, sectionCursor)) &&
      canSelectSection(sectionIndex)
    ) {
      return sectionCursor;
    }

    if (!isSectionExpanded(sectionIndex)) {
      continue;
    }

    for (
      let itemIndex =
        sectionIndex === cursor.sectionIndex ? (cursor.itemIndex ?? 0) : 0;
      itemIndex < (section.items?.length ?? 0);
      itemIndex++
    ) {
      const itemCursor = {
        sectionIndex,
        itemIndex,
      };

      if (skipInitial && areSameCursors(cursor, itemCursor)) {
        continue;
      }

      return itemCursor;
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
  isSectionExpanded: SectionPredicate,
  canSelectSection: SectionPredicate,
): Cursor {
  if (!cursor) {
    return getPrevCursor(
      { sectionIndex: 0, itemIndex: null },
      rows,
      isSectionExpanded,
      canSelectSection,
    );
  }

  const currentRowIndex = rows.findIndex(
    (row) =>
      row.sectionIndex === cursor.sectionIndex &&
      ((row.type === "item" && row.itemIndex === cursor.itemIndex) ||
        cursor.itemIndex == null),
  );

  for (let rowIndex = currentRowIndex; rowIndex >= 0; rowIndex--) {
    const row = rows[rowIndex];
    const { section, sectionIndex } = row;

    const skipItems =
      (cursor.sectionIndex === sectionIndex && cursor.itemIndex == null) ||
      !isSectionExpanded(sectionIndex);

    if (!skipItems) {
      for (
        let itemIndex =
          sectionIndex === cursor.sectionIndex
            ? (cursor.itemIndex ?? 0)
            : (section.items?.length ?? 0) - 1;
        itemIndex >= 0;
        itemIndex--
      ) {
        const itemCursor = {
          sectionIndex,
          itemIndex,
        };

        if (areSameCursors(cursor, itemCursor)) {
          continue;
        }

        return itemCursor;
      }
    }

    const sectionCursor = {
      sectionIndex,
      itemIndex: null,
    };

    if (areSameCursors(cursor, sectionCursor)) {
      continue;
    }

    if (canSelectSection(sectionIndex)) {
      return sectionCursor;
    }

    if (!isSectionExpanded(sectionIndex)) {
      continue;
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

const getSearchIndex = memoize(function <
  TItem extends Item,
  TSection extends Section<TItem>,
>({
  sections,
  searchProp = ["name", "displayName"] as unknown as SearchProps<TItem>,
}: {
  sections: TSection[];
  searchProp?: SearchProps<TItem>;
}) {
  const items = sections.flatMap((section) => section.items ?? []);
  const keys = Array.isArray(searchProp) ? searchProp : [searchProp];

  return new Fuse<TItem>(items, {
    keys,
    includeScore: true,
    isCaseSensitive: false,
  });
});

const search = memoize(function <T>({
  searchIndex,
  searchText,
}: {
  searchIndex: Fuse<T>;
  searchText: string;
}): Map<T, number> | null {
  if (searchText === "") {
    return null;
  }
  const results = searchIndex
    .search(searchText, { limit: 50 })
    .filter((result) => result.score && result.score < 0.6);

  const map = new Map<T, number>();
  for (const result of results) {
    map.set(result.item, result.score ?? 1);
  }
  return map;
});

export function itemScore<TItem extends Item, TSection extends Section<TItem>>(
  item: TItem,
  {
    searchText,
    sections,
    fuzzySearch = false,
    searchProp = ["name", "displayName"] as unknown as SearchProps<TItem>,
  }: {
    searchText: string;
    sections: TSection[];
    fuzzySearch?: boolean;
    searchProp?: SearchProps<TItem>;
  },
) {
  if (!searchText || searchText.length === 0) {
    return 0;
  }

  if (fuzzySearch) {
    const searchIndex = getSearchIndex({
      sections,
      searchProp,
    });
    const searchResults = search({ searchIndex, searchText });
    return searchResults?.get(item) ?? 1;
  }

  const searchProps = Array.isArray(searchProp) ? searchProp : [searchProp];
  for (const prop of searchProps) {
    if (searchPredicate(item, searchText, prop)) {
      return 0;
    }
  }

  return 1;
}

export function sectionScore<
  TItem extends Item,
  TSection extends Section<TItem>,
>(
  section: TSection,
  options: {
    searchText: string;
    sections: TSection[];
    fuzzySearch?: boolean;
    searchProp?: SearchProps<TItem>;
  },
) {
  if (!section.items) {
    return 1;
  }

  let best = 1;
  for (const item of section.items) {
    const score = itemScore(item, options);
    best = Math.min(best, score);
  }
  return best;
}

function searchPredicate<TItem>(item: TItem, searchText: string, prop: string) {
  const path = prop.split(".");
  const itemText = String(getIn(item, path) || "");
  return itemText.toLowerCase().indexOf(searchText.toLowerCase()) >= 0;
}

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
