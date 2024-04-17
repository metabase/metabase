import _ from "underscore";

export type Nil = null | undefined;

export const isNil = (value: any): value is Nil =>
  value === undefined || value === null;

export const removeNilValues = (obj: any) => _.pick(obj, val => !isNil(val));
