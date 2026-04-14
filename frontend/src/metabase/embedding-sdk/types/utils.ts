export type { DeepPartial } from "metabase/utils/types";

// https://www.raygesualdo.com/posts/flattening-object-keys-with-typescript-types/
export type FlattenObjectKeys<
  T extends Record<string, unknown>,
  Key = keyof T,
> = Key extends string
  ? T[Key] extends Record<string, unknown> | undefined
    ? `${Key}.${FlattenObjectKeys<Exclude<T[Key], undefined>>}`
    : `${Key}`
  : never;

type UnionKeys<T> = T extends any ? keyof T : never;
type StrictUnionHelper<T, TAllKeys extends PropertyKey> = T extends any
  ? T & Partial<Record<Exclude<TAllKeys, keyof T>, never>>
  : never;

/**
 * A type that only allows one of the union types to be used at a time.
 *
 * @inline
 */
export type StrictUnion<T> = StrictUnionHelper<T, UnionKeys<T>>;
