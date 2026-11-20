import { getClauseDefinition, getMBQLName } from "./clause";

/** The names of the arguments of a call, by their index. */
export function getArgumentNames(
  name: string,
  count: number,
): (string | null)[] {
  const clause = getClauseDefinition(getMBQLName(name) ?? "");
  if (clause == null) {
    return [];
  }
  // `case` and `if` take pairs of a condition and its output, and an optional
  // default output at the end.
  if (clause.name === "case" || clause.name === "if") {
    return Array.from({ length: count }, (_, index) => {
      if (index === count - 1 && count % 2 === 1) {
        return "default";
      }
      return index % 2 === 0 ? "condition" : "output";
    });
  }
  const names = clause.args
    .map((arg) => arg.name)
    .filter((name) => name !== "…");
  // A name for one parameter says nothing new.
  if (names.length <= 1 && !clause.multiple) {
    return [];
  }
  return Array.from({ length: count }, (_, index) => {
    if (index < names.length) {
      return names[index];
    }
    // More arguments of the same kind: value3 after value1, value2.
    const last = names[names.length - 1];
    const match = clause.multiple ? /^(.*?)(\d+)$/.exec(last ?? "") : null;
    return match ? `${match[1]}${index + 1}` : null;
  });
}

/**
 * The placeholder for the value after the first `count` values of a call:
 * the next value it defines, like an optional `mode`, or another value of a
 * function that takes any number of them, named like the parameter hints.
 * Null when the function takes no more values.
 */
export function getNextArgumentPlaceholder(
  name: string,
  count: number,
): string | null {
  // The internal name, like `get-week`, or the one typed, like `week`.
  const clause =
    getClauseDefinition(name) ?? getClauseDefinition(getMBQLName(name) ?? "");
  if (clause == null) {
    return null;
  }
  const definedArgs = clause.args.filter((arg) => arg.name !== "…");
  const next = definedArgs[count];
  if (next != null) {
    return next.template ?? next.name;
  }
  const isRepeated =
    clause.multiple || clause.args.some((arg) => arg.name === "…");
  if (!isRepeated) {
    return null;
  }
  return getArgumentNames(clause.displayName, count + 1)[count] ?? null;
}
