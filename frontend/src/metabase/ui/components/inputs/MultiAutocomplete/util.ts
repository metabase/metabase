export function parseValues(text: string): string[] {
  let insideDoubleQuotes = false;
  let escaping = false;

  let value = "";
  const values: string[] = [];

  const seen = new Set<string>();

  function add() {
    if (value === "") {
      return;
    }

    const trimmed = value.trim();

    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      values.push(trimmed);
    }

    value = "";
  }

  for (const char of text) {
    if (char === "," || char === "\n") {
      if (insideDoubleQuotes) {
        value += char;
      } else {
        add();
      }

      continue;
    }

    value += char;

    if (char === `"`) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (insideDoubleQuotes) {
        insideDoubleQuotes = false;
        add();
        continue;
      } else {
        insideDoubleQuotes = true;
        continue;
      }
    }
    if (char === "\\") {
      if (escaping) {
        escaping = false;
        continue;
      } else {
        escaping = true;
        continue;
      }
    }
  }

  values.push(value);

  return values;
}

export function cleanValue(value: string): string {
  const trimmed = value.trim();

  if (
    trimmed.startsWith('"') &&
    trimmed.endsWith('"') &&
    trimmed.at(-2) !== "\\"
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }

  return trimmed;
}
