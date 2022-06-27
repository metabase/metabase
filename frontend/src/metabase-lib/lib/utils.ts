export function nyi<T = any>(
  target: Constructor<T>,
  key: string,
  descriptor: TypedPropertyDescriptor<any> & PropertyDescriptor,
) {
  const method = descriptor.value;

  descriptor.value = function(...args) {
    console.warn(
      "Method not yet implemented: " + target.constructor.name + "::" + key,
    );
    return method.apply(this, args);
  };

  return descriptor;
}

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

type Constructor<T> = new (...args: any[]) => T;

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
        value: function(...args) {
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

const createMap = () => new Map();

// `sortObject` copies objects for deterministic serialization.
// Objects that have equal keys and values don't necessarily serialize to the
// same string. JSON.strinify prints properties in inserted order. This function
// sorts keys before adding them to the duplicated object to ensure consistent
// serialization.
export function sortObject(obj: any | any[]): any | any[] {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }

  const sortedKeyValues = Object.entries(obj).sort(([keyA], [keyB]) =>
    keyA.localeCompare(keyB),
  );
  const o: Record<string, any> = {};

  for (const [k, v] of sortedKeyValues) {
    o[k] = sortObject(v);
  }

  return o;
}

export function createLookupByProperty(items: any[], property: string) {
  const lookup: Record<string, any> = {};

  for (const item of items) {
    lookup[item[property]] = item;
  }

  return lookup;
}
