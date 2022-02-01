type Cursor = {
  sectionIndex: number;
  itemIndex: number | null;
};

type Section = {
  items: any;
};

type IsSectionExpandedFn = (sectionIndex: number) => boolean;

const getFirstItemCursor = (sections: Section[], canSelectSection: boolean) => {
  const shouldSelectItem = !canSelectSection && sections[0].items.length > 0;
  const itemIndex = shouldSelectItem ? 0 : null;

  return {
    sectionIndex: 0,
    itemIndex,
  };
};

const isFirstOfCurrentSection = (cursor: Cursor, canSelectSection: boolean) => {
  return (
    (cursor.itemIndex === 0 && !canSelectSection) || cursor.itemIndex == null
  );
};

const isLastOfCurrentSection = (
  cursor: Cursor,
  section: Section,
  canSelectSection: boolean,
  isExpanded: boolean,
) => {
  if (canSelectSection && !isExpanded) {
    return true;
  }

  return isExpanded && cursor.itemIndex === section.items.length - 1;
};

const getSectionFirstCursor = (
  sectionIndex: number,
  canSelectSection: boolean,
) => {
  return {
    sectionIndex,
    itemIndex: canSelectSection ? null : 0,
  };
};

const getSectionLastCursor = (
  sectionIndex: number,
  sections: Section[],
  isSectionExpanded: IsSectionExpandedFn,
) => {
  if (!isSectionExpanded(sectionIndex)) {
    return {
      sectionIndex,
      itemIndex: null,
    };
  }

  const itemsLength = sections[sectionIndex].items.length;

  return {
    sectionIndex,
    itemIndex: itemsLength > 0 ? itemsLength - 1 : null,
  };
};

const isLastItemSelected = (
  cursor: Cursor,
  sections: Section[],
  isSectionExpanded: IsSectionExpandedFn,
) => {
  const lastSectionIndex = sections.length - 1;
  const isExpanded = isSectionExpanded(lastSectionIndex);

  const isLastCollapsedSectionSelected =
    cursor.sectionIndex === lastSectionIndex && !isExpanded;

  const isLastItemOfLastExpandedSectionSelected =
    cursor.sectionIndex === lastSectionIndex &&
    isExpanded &&
    sections[lastSectionIndex].items.length - 1 === cursor.itemIndex;

  return (
    isLastCollapsedSectionSelected || isLastItemOfLastExpandedSectionSelected
  );
};

export const getNextCursor = (
  cursor: Cursor | null,
  sections: Section[],
  isSectionExpanded: IsSectionExpandedFn,
  canSelectSection: boolean,
): Cursor => {
  if (!cursor) {
    return getFirstItemCursor(sections, canSelectSection);
  }

  if (isLastItemSelected(cursor, sections, isSectionExpanded)) {
    return cursor;
  }
  const { sectionIndex, itemIndex } = cursor;

  if (
    isLastOfCurrentSection(
      cursor,
      sections[sectionIndex],
      canSelectSection,
      isSectionExpanded(sectionIndex),
    )
  ) {
    const nextSectionIndex = sectionIndex + 1;

    return sections[nextSectionIndex] != null
      ? getSectionFirstCursor(nextSectionIndex, canSelectSection)
      : cursor;
  }

  return {
    sectionIndex,
    itemIndex: itemIndex != null ? itemIndex + 1 : 0,
  };
};

export const getPrevCursor = (
  cursor: Cursor | null,
  sections: Section[],
  isSectionExpanded: IsSectionExpandedFn,
  canSelectSection: boolean,
) => {
  if (!cursor) {
    return getFirstItemCursor(sections, canSelectSection);
  }

  const { sectionIndex, itemIndex } = cursor;

  if (isFirstOfCurrentSection(cursor, canSelectSection)) {
    const prevSectionIndex = sectionIndex - 1;

    return prevSectionIndex >= 0
      ? getSectionLastCursor(prevSectionIndex, sections, isSectionExpanded)
      : getFirstItemCursor(sections, canSelectSection);
  }

  return {
    sectionIndex,
    itemIndex: itemIndex === 0 || itemIndex == null ? null : itemIndex - 1,
  };
};
