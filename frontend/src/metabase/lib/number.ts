export function isPositiveInteger(value: any) {
  return /^\d+$/.test(String(value));
}

export function parseNumberValue(value: any): number | null {
  const number = Number.parseFloat(value);

  if (Number.isFinite(number)) {
    return number;
  } else {
    return null;
  }
}
