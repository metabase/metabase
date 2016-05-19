
let memoized = new WeakMap();

function getWithFallback(map, key, fallback) {
    if (!map.has(key)) {
        map.set(key, fallback());
    }
    return map.get(key);
}

export default function memoize(target, name, descriptor) {
    let method = target[name];
    descriptor.value = function(...args) {
        const path = [this, method, ...args];
        const last = path.pop();
        const map = path.reduce((map, key) => getWithFallback(map, key, () => new Map), memoized);
        return getWithFallback(map, last, () => method.apply(this, args));
    }
}
