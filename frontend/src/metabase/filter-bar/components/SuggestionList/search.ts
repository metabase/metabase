// A plain substring match for now. Ranking and fuzzy search come in GDGT-3549.
export const isMatch = (text: string, query: string) =>
  text.toLowerCase().includes(query.trim().toLowerCase());

export const findExact = <T>(
  items: readonly T[],
  getLabel: (item: T) => string,
  query: string,
) => {
  const search = query.trim().toLowerCase();
  const labels = items.map((item) => getLabel(item).toLowerCase());
  const matches = items.filter((_, index) => labels[index] === search);
  const isPrefixOfOther = labels.some(
    (label) => label !== search && label.startsWith(search),
  );
  const isUnique = matches.length === 1;
  return search !== "" && isUnique && !isPrefixOfOther ? matches[0] : null;
};
