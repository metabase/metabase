export const searchItems = (items, filter) => {
  const matchingItems = items.filter(
    item =>
      !item.isHiddenFromSearch && item.name.toLowerCase().includes(filter),
  );

  const children = items
    .map(c => c.children)
    .filter(Boolean)
    .flat();

  const childrenMatches =
    children.length > 0 ? searchItems(children, filter) : [];

  return [...matchingItems, ...childrenMatches].map(
    ({ children, ...item }) => item,
  );
};
