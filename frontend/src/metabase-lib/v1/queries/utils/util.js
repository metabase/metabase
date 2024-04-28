import _ from "underscore";

export const noNullValues = clause => _.all(clause, c => c != null);

// these are mostly to circumvent Flow type checking :-/
export const op = clause => clause[0];
export const args = clause => clause.slice(1);

export const add = (items, item) => [...items, item];
export const update = (items, index, newItem) => [
  ...items.slice(0, index),
  newItem,
  ...items.slice(index + 1),
];
export const remove = (items, index) => [
  ...items.slice(0, index),
  ...items.slice(index + 1),
];
