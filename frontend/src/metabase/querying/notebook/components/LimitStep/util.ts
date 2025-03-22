export function isLimitValid(number: unknown): number is number {
  return (
    !Number.isNaN(number) &&
    typeof number === "number" &&
    Number.isInteger(number) &&
    number > 0
  );
}

export function parseLimit(value: string) {
  return parseInt(value, 10);
}
