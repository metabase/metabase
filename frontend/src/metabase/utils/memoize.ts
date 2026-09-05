type Constructor<T> = new (...args: any[]) => T;

type MapLike<K, V> = Map<K, V> | WeakMap<WeakKey, V>;

function getMapLikeWithFallback<K, V>(
  map: MapLike<K, V>,
  key: K,
  fallback: () => V,
): V {
  // Unjustified type cast. FIXME
  if ("has" in map && map.has(key as any)) {
    // Unjustified type cast. FIXME
    return map.get(key as any)!;
  } else {
    const value = fallback();
    // Unjustified type cast. FIXME
    map.set(key as any, value);
    return value;
  }
}

type CacheValue = unknown;
type CacheMap = Map<unknown, CacheValue | CacheMap>;

const rootCache = new WeakMap<object, CacheMap>();
const createCacheMap = (): CacheMap => new Map();

export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const memoizedFn = (...args: Parameters<T>): ReturnType<T> => {
    const [first, ...rest] = [fn, args.length, ...args];
    const lastKey = rest.pop()!;

    let currentMap = getMapLikeWithFallback(rootCache, first, createCacheMap);
    for (const key of rest) {
      const nextMap = getMapLikeWithFallback(currentMap, key, createCacheMap);
      if (nextMap instanceof Map) {
        currentMap = nextMap;
      } else {
        throw new Error("Invalid cache structure");
      }
    }

    return getMapLikeWithFallback(currentMap, lastKey, () => fn(...args));
  };

  // Unjustified type cast. FIXME
  return memoizedFn as T;
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

const createMap = () => new Map();

/**
 * This method implements memoization for class methods
 * It creates a map where class itself, method and all the parameters are used as keys for a nested map
 * map<class, map<method, map<param1, map<param2, map<param3...>>>>>
 *
 * If you use objects as parameters, make sure their references are stable as they will be used as keys
 *
 * @param keys - class methods to memoize
 * @returns the same class with memoized methods
 */
export function memoizeClass<T>(
  ...keys: string[]
): (Class: Constructor<T>) => Constructor<T> {
  return (Class: Constructor<T>): Constructor<T> => {
    const descriptors = Object.getOwnPropertyDescriptors(Class.prototype);

    keys.forEach((key) => {
      // Is targeted method present in Class?
      if (!(key in descriptors)) {
        throw new TypeError(`${key} is not a member of class`);
      }

      const descriptor = descriptors[key];
      const method = descriptor.value;
      // If we don't get a descriptor.value, it must have a getter (i.e., ES6 class properties)
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
