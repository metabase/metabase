export function isLimitValid(number: number) {
  return !Number.isNaN(number) && Number.isInteger(number) && number > 0;
}

export function parseLimit(value: string) {
  return parseInt(value, 10);
}
