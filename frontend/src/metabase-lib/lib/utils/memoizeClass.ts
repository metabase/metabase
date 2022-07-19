import { Constructor } from "./types";

function getWithFallback(
  map: Map<string, any>,
  key: string,
  fallback: () => void,
) {
  if (map.has(key)) {
    return map.get(key);
  } else {
    const value = fallback();
    map.set(key, value);
    return value;
  }
}

const memoized = new WeakMap();

const createMap = () => new Map();

export function memoizeClass<T>(
  ...keys: string[]
): (Class: Constructor<T>) => Constructor<T> {
  return (Class: Constructor<T>): Constructor<T> => {
    const descriptors = Object.getOwnPropertyDescriptors(Class.prototype);

    keys.forEach(key => {
      // Is targeted method present in Class?
      if (!(key in descriptors)) {
        throw new TypeError(`${key} is not a member of class`);
      }

      const descriptor = descriptors[key];
      const method = descriptor.value;
      // If we don't get a decsriptor.value, it must have a getter (i.e., ES6 class properties)
      if (!method) {
        throw new TypeError(`Class properties cannot be memoized`);
      }
      // Method should be a function/method
      else if (typeof method !== "function") {
        throw new TypeError(`${key} is not a method and cannot be memoized`);
      }

      // Memoize
      Object.defineProperty(Class.prototype, key, {
        ...descriptor,
        value: function (...args: any[]) {
          const path = [this, method, args.length, ...args];
          const last = path.pop();
          const map = path.reduce(
            (map, key) => getWithFallback(map, key, createMap),
            memoized,
          );
          return getWithFallback(map, last, () => method.apply(this, args));
        },
      });
    });

    return Class;
  };
}
