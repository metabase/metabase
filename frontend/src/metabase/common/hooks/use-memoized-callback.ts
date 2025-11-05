import { useMemo } from "react";

type MapLike<K, V> = Map<K, V> | WeakMap<object & K, V>;

function getWithFallback<K, V>(
  map: MapLike<K, V>,
  key: K,
  fallback: () => V,
): V {
  if ("has" in map && map.has(key as any)) {
    return map.get(key as any)!;
  } else {
    const value = fallback();
    map.set(key as any, value);
    return value;
  }
}

type CacheValue = unknown;
type CacheMap = Map<unknown, CacheValue | CacheMap>;

const rootCache = new WeakMap<object, CacheMap>();
const createMap = () => new Map() as CacheMap;

export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const memoized = (...args: Parameters<T>): ReturnType<T> => {
    const [first, ...rest] = [fn, args.length, ...args];
    const lastKey = rest.pop()!;

    let currentMap = getWithFallback(rootCache, first, createMap);
    for (const key of rest) {
      const nextMap = getWithFallback(currentMap, key, createMap);
      if (nextMap instanceof Map) {
        currentMap = nextMap;
      } else {
        throw new Error("Invalid cache structure");
      }
    }

    return getWithFallback(currentMap, lastKey, () => fn(...args));
  };

  return memoized as T;
}

export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList = [],
): T {
  return useMemo(() => {
    return memoize((...args: Parameters<T>): ReturnType<T> => {
      return callback(...args);
    }) as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
