/**
 * The single memoize helper for the app. Import it from here rather than from
 * underscore or reselect, so there is one implementation to reason about.
 *
 * It keys on every argument: object arguments by reference through a WeakMap,
 * primitives by value through a Map. An entry with an object argument is
 * released once that object is. An entry keyed only on primitives is not, so do
 * not build one of these at module scope, where it lives for the life of the
 * tab. See the no-module-level-memoize lint rule.
 *
 * To memoize a class method, assign a memoized arrow to a class field. The
 * field is created per instance, so its cache is released with the instance.
 */
export { weakMapMemoize as memoize } from "@reduxjs/toolkit";
