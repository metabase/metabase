import { weakMapMemoize } from "@reduxjs/toolkit";

type Constructor<T> = new (...args: any[]) => T;

/**
 * The single memoize helper for the app. Import it from here rather than from
 * underscore or reselect, so there is one implementation to reason about.
 *
 * It keys on every argument: object arguments by reference through a WeakMap,
 * primitives by value through a Map. An entry with an object argument is
 * released once that object is. An entry keyed only on primitives is not, so do
 * not build one of these at module scope, where it lives for the life of the
 * tab. See the no-module-level-memoize lint rule.
 */
export { weakMapMemoize as memoize };

/**
 * Memoizes the named methods of a class, per instance.
 *
 * Each method gets its own cache, keyed on the instance first and then on the
 * arguments. The instance is an object, so its entries are released along with
 * it. Object arguments are compared by reference, so keep those stable.
 *
 * @param keys - class methods to memoize
 * @returns the same class with memoized methods
 */
export function memoizeClass<T>(
  ...keys: string[]
): (Class: Constructor<T>) => Constructor<T> {
  return (Class: Constructor<T>): Constructor<T> => {
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(Class.prototype, key);

      if (descriptor == null) {
        throw new TypeError(`${key} is not a member of class`);
      }

      // A getter or an ES6 class property has no descriptor.value.
      const method: unknown = descriptor.value;
      if (method == null) {
        throw new TypeError(`Class properties cannot be memoized`);
      }
      if (typeof method !== "function") {
        throw new TypeError(`${key} is not a method and cannot be memoized`);
      }

      const memoizedMethod = weakMapMemoize((instance: T, ...args: unknown[]) =>
        method.apply(instance, args),
      );

      Object.defineProperty(Class.prototype, key, {
        ...descriptor,
        value: function (this: T, ...args: unknown[]) {
          return memoizedMethod(this, ...args);
        },
      });
    }

    return Class;
  };
}
