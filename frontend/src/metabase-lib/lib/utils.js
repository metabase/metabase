export function nyi(target, key, descriptor) {
  let method = descriptor.value;
  descriptor.value = function() {
    console.warn(
      "Method not yet implemented: " + target.constructor.name + "::" + key,
    );
    return method.apply(this, arguments);
  };
  return descriptor;
}

let memoized = new WeakMap();

function getWithFallback(map, key, fallback) {
  if (!map.has(key)) {
    map.set(key, fallback());
  }
  return map.get(key);
}

export function memoize(target, name, descriptor) {
  let method = target[name];
  descriptor.value = function(...args) {
    const path = [this, method, ...args];
    const last = path.pop();
    const map = path.reduce(
      (map, key) => getWithFallback(map, key, () => new Map()),
      memoized,
    );
    return getWithFallback(map, last, () => method.apply(this, args));
  };
}
