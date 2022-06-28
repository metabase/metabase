import { Constructor } from "./types";

export function nyi<T = any>(
  target: Constructor<T>,
  key: string,
  descriptor: TypedPropertyDescriptor<any> & PropertyDescriptor,
) {
  const method = descriptor.value;

  descriptor.value = function(...args: any[]) {
    console.warn(
      "Method not yet implemented: " + target.constructor.name + "::" + key,
    );
    return method.apply(this, args);
  };

  return descriptor;
}
