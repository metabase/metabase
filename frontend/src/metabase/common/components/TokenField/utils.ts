export function parseStringValue(value: any): string | null {
  const trimmedValue = trim(value);
  if (trimmedValue === "") {
    return null;
  }

  return trimmedValue;
}

function trim(value: any) {
  return String(value || "").trim();
}
