import inflection from "inflection";

export function capitalize(str: string, { lowercase = true } = {}) {
  const firstChar = str.charAt(0).toUpperCase();
  let rest = str.slice(1);
  if (lowercase) {
    rest = rest.toLowerCase();
  }
  return firstChar + rest;
}

/**
 * @deprecated: do not use since it changes most non-English words incorrectly
 */
export function inflect(
  str: string,
  count: number,
  singular?: string,
  plural?: string,
) {
  return inflection.inflect(str, count, singular, plural);
}

/**
 * @deprecated: do not use since it changes most non-English words incorrectly
 */
export function titleize(str: string) {
  return inflection.titleize(str);
}

export function humanize(str: string, lowFirstLetter?: boolean) {
  return inflection.humanize(str, lowFirstLetter);
}

export function conjunct(list: string[], conjunction: string) {
  return (
    list.slice(0, -1).join(`, `) +
    (list.length > 2 ? `,` : ``) +
    (list.length > 1 ? ` ${conjunction} ` : ``) +
    (list[list.length - 1] || ``)
  );
}

// Removes trailing "id" from field names
export function stripId(name: string) {
  return name?.replace(/ id$/i, "").trim();
}
