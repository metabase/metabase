type UnionToIntersection<Union> = (
  Union extends unknown ? (arg: Union) => void : never
) extends (arg: infer Intersection) => void
  ? Intersection
  : never;

/**
 * Merges objects by copying property descriptors rather than reading values.
 *
 * A spread or a rest destructure evaluates every getter it copies. Where an
 * object holds `get name() { return t`...`; }` so that the string translates
 * when it is read, spreading that object at module scope translates it at
 * import instead, and the result is frozen in whatever language was loaded.
 * This keeps the getters as getters.
 */
export function mergeLazily<Sources extends object[]>(
  ...sources: Sources
): UnionToIntersection<Sources[number]> {
  const target = {};
  for (const source of sources) {
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
  }
  return target as UnionToIntersection<Sources[number]>;
}

/**
 * Like `mergeLazily`, but drops the named keys. Use it where a helper consumes
 * some keys itself and passes the rest on.
 */
export function omitLazily<Result extends object>(
  source: object,
  keys: string[],
): Result {
  const descriptors = Object.getOwnPropertyDescriptors(source);
  for (const key of keys) {
    delete descriptors[key as keyof typeof descriptors];
  }
  return Object.defineProperties({}, descriptors) as Result;
}
