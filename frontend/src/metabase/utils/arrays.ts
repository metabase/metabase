export function moveElement<T>(array: T[], oldIndex: number, newIndex: number) {
  const arrayCopy = [...array];
  arrayCopy.splice(newIndex, 0, arrayCopy.splice(oldIndex, 1)[0]);
  return arrayCopy;
}

export const sumArray = (values: number[]) =>
  values.reduce((acc, value) => acc + value, 0);

export const findWithIndex = <T>(
  arr: T[],
  predicate: (value: T, index: number, arr: T[]) => boolean,
) => {
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (predicate(item, i, arr)) {
      return { item, index: i };
    }
  }
  return {
    index: -1,
    item: undefined,
  };
};
