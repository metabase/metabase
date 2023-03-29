export function moveElement<T>(array: T[], oldIndex: number, newIndex: number) {
  const arrayCopy = [...array];
  arrayCopy.splice(newIndex, 0, arrayCopy.splice(oldIndex, 1)[0]);
  return arrayCopy;
}

export const sumArray = (values: number[]) =>
  values.reduce((acc, value) => acc + value, 0);
