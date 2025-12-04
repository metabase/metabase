export const nameSorter = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name);

export const lastModifiedSorter = <T extends { updated_at: string }>(
  a: T,
  b: T,
) => {
  const dateA = new Date(a.updated_at).getTime();
  const dateB = new Date(b.updated_at).getTime();
  return dateB - dateA;
};
