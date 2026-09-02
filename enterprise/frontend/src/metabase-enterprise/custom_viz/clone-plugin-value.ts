import {
  isDate,
  isFunction,
  isMap,
  isObject,
  isSet,
} from "metabase-types/guards";

// Every object a plugin creates reaches the host as a membrane proxy, which structuredClone rejects.
// Those are copied by reading through them instead.
export function clonePluginValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    // Same contract as structuredClone: a deep copy with the input's shape.
    return copy(value) as T;
  }
}

function copy(value: unknown): unknown {
  if (isFunction(value)) {
    throw new TypeError("Functions can't be copied");
  }
  if (!isObject(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(copy);
  }
  if (isMap(value)) {
    return new Map(
      [...value].map(([key, entry]): [unknown, unknown] => [
        copy(key),
        copy(entry),
      ]),
    );
  }
  if (isSet(value)) {
    return new Set([...value].map(copy));
  }
  if (isDate(value)) {
    return new Date(value.getTime());
  }

  const tag = Object.prototype.toString.call(value);
  if (tag !== "[object Object]") {
    throw new TypeError(`${tag} can't be copied`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, copy(entry)]),
  );
}
