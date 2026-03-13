type NamedItem = { name: string };

type SectionWithItems<TItem extends NamedItem> = {
  items?: TItem[];
  [key: string]: unknown;
};

type GroupWithSections<TItem extends NamedItem> = {
  sections: SectionWithItems<TItem>[];
  [key: string]: unknown;
};

export function filterDisplayGroupsBySearch<
  TItem extends NamedItem,
  TGroup extends GroupWithSections<TItem>,
>(displayGroups: TGroup[], searchText: string): TGroup[] | null {
  if (!searchText.trim()) {
    return null;
  }
  const lowerSearch = searchText.toLowerCase();
  return displayGroups
    .map((group) => {
      const filteredSections = group.sections
        .map((section) => ({
          ...section,
          items: section.items?.filter((item) =>
            item.name.toLowerCase().includes(lowerSearch),
          ),
        }))
        .filter((section) => section.items && section.items.length > 0);

      return {
        ...group,
        sections: filteredSections,
      };
    })
    .filter((group) => group.sections.length > 0);
}
