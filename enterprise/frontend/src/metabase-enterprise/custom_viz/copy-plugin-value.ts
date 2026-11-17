import {
  isDate,
  isFunction,
  isMap,
  isObject,
  isSet,
} from "metabase-types/guards";

// Values a plugin hands the host arrive as membrane proxies
export function copyPluginValue<T>(value: T): T {
  // Same shape as the input, like structuredClone.
  return copy(value) as T;
}

function copy(value: unknown): unknown {
  if (isFunction(value)) {
    throw new TypeError("Functions can't be copied");
  }

  // A symbol-tagged object (e.g. `$$typeof`) could pass for a React element in the host.
  if (typeof value === "symbol") {
    throw new TypeError("Symbols can't be copied");
  }

  if (!isObject(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return Array.from(value, copy);
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
