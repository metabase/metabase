/**
 * Lightweight querystring parse/stringify using native URLSearchParams.
 * Drop-in replacement for the Node.js "querystring" module used browser-side.
 */

export type ParsedQuery = Record<string, string | string[] | undefined>;

export type StringifyInput = Record<
  string,
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly boolean[]
  | null
  | undefined
>;

export function parse(qs: string): ParsedQuery {
  const params = new URLSearchParams(qs);
  const result: ParsedQuery = {};

  for (const key of params.keys()) {
    const values = params.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }

  return result;
}

export function stringify(obj: StringifyInput): string {
  const params = new URLSearchParams();

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, String(v));
      }
    } else {
      params.append(key, String(value));
    }
  }

  // URLSearchParams encodes spaces as "+", but Node's querystring uses "%20".
  // Use "%20" for consistency with the previous behavior and URL standards.
  return params.toString().replace(/\+/g, "%20");
}
