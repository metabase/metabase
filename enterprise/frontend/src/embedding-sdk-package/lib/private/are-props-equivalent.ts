const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

export const MAX_PROP_COMPARE_DEPTH = 5;

/**
 * Whether two prop sets are equivalent for rendering purposes.
 *
 * Deliberately not a general deep-equal: it is depth-bounded and only traverses
 * object/array literals, so foreign values (metabase-lib queries, membrane
 * proxies, class instances, functions) are compared by identity rather than
 * walked.
 */
export const arePropsEquivalent = (
  renderedValue: unknown,
  nextValue: unknown,
  depth = 0,
): boolean => {
  if (Object.is(renderedValue, nextValue)) {
    return true;
  }

  if (depth >= MAX_PROP_COMPARE_DEPTH) {
    return false;
  }

  if (Array.isArray(renderedValue) && Array.isArray(nextValue)) {
    return (
      renderedValue.length === nextValue.length &&
      renderedValue.every((item, index) =>
        arePropsEquivalent(item, nextValue[index], depth + 1),
      )
    );
  }

  if (isPlainObject(renderedValue) && isPlainObject(nextValue)) {
    const renderedKeys = Object.keys(renderedValue);

    return (
      renderedKeys.length === Object.keys(nextValue).length &&
      renderedKeys.every(
        (key) =>
          Object.hasOwn(nextValue, key) &&
          arePropsEquivalent(renderedValue[key], nextValue[key], depth + 1),
      )
    );
  }

  return false;
};
