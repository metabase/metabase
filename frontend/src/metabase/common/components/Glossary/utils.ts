import type { KeyboardEvent } from "react";

import type { GlossaryItem } from "metabase/api";

import type { GlossaryField, GlossarySort } from "./types";

export function getVisibleItems(
  glossary: GlossaryItem[],
  searchQuery: string,
  sort: GlossarySort | null,
) {
  const items = filterItems(glossary, searchQuery);
  if (sort == null) {
    return items;
  }
  return items.toSorted((a, b) => {
    const result = a[sort.column].localeCompare(b[sort.column], undefined, {
      numeric: true,
    });
    return sort.direction === "asc" ? result : -result;
  });
}

function filterItems(glossary: GlossaryItem[], searchQuery: string) {
  if (searchQuery === "") {
    return glossary;
  }
  const normalizedQuery = searchQuery.toLocaleLowerCase();
  return glossary.filter(
    ({ term, definition }) =>
      term.toLocaleLowerCase().includes(normalizedQuery) ||
      definition.toLocaleLowerCase().includes(normalizedQuery),
  );
}

/** A header cycles ascending, descending, then back to the server order. */
export function getNextSort(
  sort: GlossarySort | null,
  column: GlossaryField,
): GlossarySort | null {
  if (sort?.column !== column) {
    return { column, direction: "asc" };
  }
  if (sort.direction === "asc") {
    return { column, direction: "desc" };
  }
  return null;
}

/** Terms are unique case-insensitively; `ownId` lets an entry keep its own term. */
export function isDuplicateTerm(
  glossary: GlossaryItem[],
  term: string,
  ownId?: GlossaryItem["id"],
) {
  const normalizedTerm = normalizeTerm(term);
  return (
    normalizedTerm !== "" &&
    glossary.some(
      (item) =>
        item.id !== ownId && normalizeTerm(item.term) === normalizedTerm,
    )
  );
}

function normalizeTerm(term: string) {
  return term.trim().toLowerCase();
}

/** Enter commits a glossary field; Shift+Enter inserts a line break, but only in a definition. */
export function isCommitKey(event: KeyboardEvent, field: GlossaryField) {
  const isLineBreak = field === "definition" && event.shiftKey;
  return (
    event.key === "Enter" && !isLineBreak && !event.nativeEvent.isComposing
  );
}

/** Escape discards a glossary edit, unless it is closing an IME composition. */
export function isCancelKey(event: KeyboardEvent) {
  return event.key === "Escape" && !event.nativeEvent.isComposing;
}
