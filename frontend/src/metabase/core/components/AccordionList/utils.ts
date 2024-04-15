type Cursor = {
  sectionIndex: number;
  itemIndex: number | null;
};

type Section = {
  items: any;
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
        sectionIndex === cursor.sectionIndex ? cursor.itemIndex ?? 0 : 0;
      itemIndex < section.items.length;
      itemIndex++
    ) {
      const item = section.items[itemIndex];
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
            ? cursor.itemIndex ?? 0
            : section.items.length - 1;
        itemIndex >= 0;
        itemIndex--
      ) {
        const item = section.items[itemIndex];
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
