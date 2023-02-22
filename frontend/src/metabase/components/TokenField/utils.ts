export function parseNumberValue(value: any): number | null {
  const number = Number.parseFloat(value);

  if (Number.isFinite(number)) {
    return number;
  } else {
    return null;
  }
}

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
