/**
 * Makes every property in the object optional.
 *
 * @inline
 **/
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// https://www.raygesualdo.com/posts/flattening-object-keys-with-typescript-types/
export type FlattenObjectKeys<
  T extends Record<string, unknown>,
  Key = keyof T,
> = Key extends string
  ? T[Key] extends Record<string, unknown> | undefined
    ? `${Key}.${FlattenObjectKeys<Exclude<T[Key], undefined>>}`
    : `${Key}`
  : never;

/**
 * Generic used to validate that an array is of length of a union and that the elements of the array are of the union type.
 * https://www.reddit.com/r/typescript/comments/xa9ezz/comment/lnspgzw/
 *
 * This variant does not have the combination explosion issue
 */
export type ArrayOfUnion<
  TOriginal,
  TCurrent = TOriginal,
  TLast = LastOf<TCurrent>,
> = [TCurrent] extends [never]
  ? []
  : [...ArrayOfUnion<TOriginal, Exclude<TCurrent, TLast>>, TOriginal];

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

type LastOf<T> =
  UnionToIntersection<T extends any ? (x: T) => void : never> extends (
    x: infer L,
  ) => void
    ? L
    : never;
