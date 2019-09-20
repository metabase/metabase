export function nyi(target, key, descriptor) {
  const method = descriptor.value;
  descriptor.value = function() {
    console.warn(
      "Method not yet implemented: " + target.constructor.name + "::" + key,
    );
    return method.apply(this, arguments);
  };
  return descriptor;
}

function getWithFallback(map, key, fallback) {
  if (map.has(key)) {
    return map.get(key);
  } else {
    const value = fallback();
    map.set(key, value);
    return value;
  }
}

const memoized = new WeakMap();
export function memoize(target, name, descriptor) {
  const method = target[name];
  descriptor.value = function(...args) {
    const path = [this, method, ...args];
    const last = path.pop();
    const map = path.reduce(
      (map, key) => getWithFallback(map, key, createMap),
      memoized,
    );
    return getWithFallback(map, last, () => method.apply(this, args));
  };
}

const createMap = () => new Map();
