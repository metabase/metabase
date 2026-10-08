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
 *
 * At runtime the last source wins, as it does in a spread. The return type is
 * an intersection of the sources rather than an override of one by the next,
 * because a recursive override type is too expensive for tsc on the larger
 * merges here. Two sources that give the same key incompatible types therefore
 * read back as `never` instead of as the last source's type.
 */
export function mergeLazily<Sources extends object[]>(
  ...sources: Sources
): UnionToIntersection<Sources[number]> {
  const target = {};
  for (const source of sources) {
    Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
  }
  // Object.defineProperties returns a plain object; the shape is what the
  // descriptors carry.
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
    // Descriptor maps are keyed by the source's own property names.
    delete descriptors[key as keyof typeof descriptors];
  }
  // Object.defineProperties returns a plain object; the shape is what the
  // descriptors carry.
  return Object.defineProperties({}, descriptors) as Result;
}

/**
 * Copies properties onto an existing object without reading them.

 * `Object.assign` evaluates getters; this keeps them.
 */
export function assignLazily<Target extends object, Source extends object>(
  target: Target,
  source: Source,
): Target & Source {
  Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
  // Object.defineProperties returns a plain object; the shape is what the
  // descriptors carry.
  return target as Target & Source;
}
