import {
  isDate,
  isFunction,
  isMap,
  isObject,
  isSet,
} from "metabase-types/guards";

// Values a plugin hands the host arrive as membrane proxies. The host keeps a proxy-free copy,
// so its state never aliases sandbox objects and clones cleanly on the way back to the plugin.
export function copyPluginValue<T>(value: T): T {
  // Same shape as the input, like structuredClone.
  return copy(value) as T;
}

// Widget props may carry callbacks for the plugin's own widget, so entries that can't be copied are kept.
export function copyPluginProps(props: unknown): Record<string, unknown> {
  if (!isObject(props)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(props).map(([key, prop]) => [key, copyOrKeep(prop)]),
  );
}

function copyOrKeep(value: unknown): unknown {
  try {
    return copy(value);
  } catch {
    return value;
  }
}

function copy(value: unknown): unknown {
  if (isFunction(value)) {
    throw new TypeError("Functions can't be copied");
  }
  if (!isObject(value)) {
    return value;
  }
  // Built with the host's own constructors: a method called on a proxy runs in the
  // sandbox realm and hands back another proxy.
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
