export const countWithinLimit = (sizes: number[], limit: number): number => {
  let total = 0;
  for (let index = 0; index < sizes.length; index++) {
    total += sizes[index];
    if (total > limit) {
      return index;
    }
  }
  return sizes.length;
};
