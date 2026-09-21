/**
 * A URL query as this hook passes it around: parsed out of the search string,
 * where a repeated key comes through as an array, and serialized back, where a
 * key the state no longer needs is `undefined`.
 */
export type UrlStateQuery = Record<
  string,
  string | string[] | null | undefined
>;

export type QueryParam = UrlStateQuery[string];
