/* @flow */

import _ from "underscore";

// determines whether 2 field IDs are equal. This is needed rather than
// doing a simple comparison because field IDs are not guaranteed to be numeric:
// the might be FieldLiterals, e.g. [field-literal <name> <unit>], instead.
export const fieldIdsEq = (a: any, b: any): boolean => {
  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a === "number") {
    return a === b;
  }

  if (a == null && b == null) {
    return true;
  }

  // field literals
  if (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === 3 &&
    b.length === 3 &&
    a[0] === "field-literal" &&
    b[0] === "field-literal"
  ) {
    return a[1] === b[1];
  }

  console.warn("Don't know how to compare these IDs:", a, b);
  return false;
};

export const noNullValues = (clause: any[]): boolean =>
  _.all(clause, c => c != null);

// these are mostly to circumvent Flow type checking :-/
export const op = (clause: any): string => clause[0];
export const args = (clause: any[]): any[] => clause.slice(1);

export const add = <T>(items: T[], item: T): T[] => [...items, item];
export const update = <T>(items: T[], index: number, newItem: T): T[] => [
  ...items.slice(0, index),
  newItem,
  ...items.slice(index + 1),
];
export const remove = <T>(items: T[], index: number): T[] => [
  ...items.slice(0, index),
  ...items.slice(index + 1),
];
export const clear = <T>(): T[] => [];
