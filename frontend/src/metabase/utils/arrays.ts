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

/**
 * Calls `fn` with each index from 0 to `count - 1` and returns the results.
 * A negative `count` returns an empty array.
 */
export function times<T>(count: number, fn: (index: number) => T): T[] {
  // we keep underscore's RangeError for a fractional or NaN count
  const result = new Array<T>(Math.max(0, count));
  for (let index = 0; index < count; index++) {
    result[index] = fn(index);
  }
  return result;
}
