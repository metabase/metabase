/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
import type { ITreeNodeItem } from "metabase/common/components/tree/types";

export const searchItems = (
  items: any[],
  filter: string,
  getSearchText: (item: ITreeNodeItem) => string = (item) => item.name,
) => {
  const matchingItems = items.filter((item) =>
    getSearchText(item).toLowerCase().includes(filter),
  );

  const children = items
    .map((c) => c.children)
    .filter(Boolean)
    .flat();

  const childrenMatches: any =
    children.length > 0 ? searchItems(children, filter, getSearchText) : [];

  return [...matchingItems, ...childrenMatches].map(
    ({ children, ...item }) => item,
  );
};
