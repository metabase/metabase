import { shallowEqual } from "@mantine/hooks";
import Fuse from "fuse.js";
import { type ReactNode, isValidElement } from "react";
import { isFragment } from "react-is";

import type { Item, SearchProps, Section } from "./types";

export type Cursor = {
  sectionIndex: number;
  itemIndex: number | null;
};

type SectionPredicate = (sectionIndex: number) => boolean;
type ItemFilterPredicate = (item: any) => boolean;

const areSameCursors = (left: Cursor, right: Cursor) => {
  return (
    left.itemIndex === right.itemIndex &&
    left.sectionIndex === right.sectionIndex
  );
};

export const getNextCursor = (
  cursor: Cursor | null,
  sections: Section[],
  isSectionExpanded: SectionPredicate,
  canSelectSection: SectionPredicate,
  filterFn: ItemFilterPredicate,
  skipInitial: boolean = true,
): Cursor => {
  if (!cursor) {
    return getNextCursor(
      { sectionIndex: 0, itemIndex: null },
      sections,
      isSectionExpanded,
      canSelectSection,
      filterFn,
      false,
    );
  }

  for (
    let sectionIndex = cursor.sectionIndex;
    sectionIndex < sections.length;
    sectionIndex++
  ) {
    const section = sections[sectionIndex];

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
      const item = section.items?.[itemIndex];
      const itemCursor = {
        sectionIndex,
        itemIndex,
      };

      if (skipInitial && areSameCursors(cursor, itemCursor)) {
        continue;
      }

      if (filterFn(item)) {
        return itemCursor;
      }
    }
  }

  return cursor;
};

export const getPrevCursor = (
  cursor: Cursor | null,
  sections: Section[],
  isSectionExpanded: SectionPredicate,
  canSelectSection: SectionPredicate,
  filterFn: ItemFilterPredicate,
): Cursor => {
  if (!cursor) {
    return getNextCursor(
      { sectionIndex: 0, itemIndex: null },
      sections,
      isSectionExpanded,
      canSelectSection,
      filterFn,
      false,
    );
  }

  for (
    let sectionIndex = cursor.sectionIndex;
    sectionIndex >= 0;
    sectionIndex--
  ) {
    const section = sections[sectionIndex];

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
        const item = section.items?.[itemIndex];
        const itemCursor = {
          sectionIndex,
          itemIndex,
        };

        if (areSameCursors(cursor, itemCursor)) {
          continue;
        }

        if (filterFn(item)) {
          return itemCursor;
        }
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
};

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

export const getSearchIndex = memoize(function <
  TItem extends Item,
  TSection extends Section<TItem>,
>({
  sections,
  searchProp = ["name", "displayName"],
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

/**
 * Memoizes a function based on shallow equality of its argument.
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

export function search<T>(
  searchIndex: Fuse<T>,
  searchText: string,
): Fuse.FuseResult<T>[] | null {
  if (searchText === "") {
    return null;
  }
  return searchIndex
    .search(searchText, {
      limit: 50,
    })
    .filter((result) => result.score && result.score < 0.4);
}
