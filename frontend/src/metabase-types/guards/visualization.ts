import { isObject } from "./common";

export function isObjectWithRaw<T>(object: T): object is T & { _raw?: T } {
  return isObject(object) && "_raw" in object;
}
