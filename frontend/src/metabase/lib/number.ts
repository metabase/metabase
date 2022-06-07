export function isPositiveInteger(value: any) {
  return /^\d+$/.test(String(value));
}
