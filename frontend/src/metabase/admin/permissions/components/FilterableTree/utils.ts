export const searchItems = (items: any[], filter: string) => {
  const matchingItems = items.filter(item =>
    item.name.toLowerCase().includes(filter),
  );

  const children = items
    .map(c => c.children)
    .filter(Boolean)
    .flat();

  const childrenMatches: any =
    children.length > 0 ? searchItems(children, filter) : [];

  return [...matchingItems, ...childrenMatches].map(
    ({ children, ...item }) => item,
  );
};
