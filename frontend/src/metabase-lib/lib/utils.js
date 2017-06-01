export function nyi(target, key, descriptor) {
    let method = descriptor.value;
    descriptor.value = function() {
        console.warn(
            "Method not yet implemented: " +
                target.constructor.name +
                "::" +
                key
        );
        return method.apply(this, arguments);
    };
    return descriptor;
}
