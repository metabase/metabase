/**
 * TL;DR: have a "Property '[exactMarker]' is missing in type ..." error? Wrap the
 * argument: `createCard(exact(payload))`. If that surfaces a second error about
 * a property of type `never`, that one is a real bug: `payload` has a key the
 * endpoint doesn't accept, so stop passing it.
 *
 * ---
 *
 * Why do we need `exact`? TypeScript only excess-property-checks fresh object literals,
 * so `createCard(card)` compiles even when `card` carries keys the endpoint
 * doesn't accept — and the backend rejects unknown keys in dev/test.
 * `createCard(exact(card))` makes TypeScript check `card` for excess keys. In
 * practice you'll only need it on mutations, where a whole entity tends to get
 * spread into the request body; it can't be used on query hooks.
 *
 * Why the `exactMarker` brand? Because exactness has to survive being passed
 * around. Checking at the callsite isn't enough if an intermediate boundary is
 * typed with the unbranded shape:
 *
 * ```
 * function thunk(request: CreateCardRequestFields) {
 *   // no error: CheckExact<T, T> bans Exclude<keyof T, keyof T>, i.e. nothing
 *   return createCard(exact(request));
 * }
 *
 * thunk(card) // no error either: `card` is assignable to CreateCardRequestFields
 * ```
 *
 * Branding the request type itself closes that off, since `exact` is the only
 * way to produce one (short of a cast):
 *
 * ```
 * // keep the shape inline — exporting it lets callers reopen the hole above
 * type CreateCardRequest = Exact<{ name: string; display: string }>;
 *
 * function thunk(request: CreateCardRequest) {
 *   return createCard(request);
 * }
 *
 * thunk(exact({ name, display }))      // ok
 * thunk(exact(card))                   // error: `card` has excess keys
 * thunk({ name, display })             // error: missing the brand
 * ```
 */

declare const exactMarker: unique symbol;

/** A request payload that has been checked for keys the endpoint doesn't expect. */
export type Exact<T> = T & { readonly [exactMarker]: true };

type CheckExact<T extends Shape, Shape> = T &
  Record<Exclude<keyof T, keyof Shape>, never>;

/**
 * Brands a payload after checking it carries no keys the endpoint doesn't expect.
 * `Shape` is inferred from the contextual type, so this only works in argument
 * position or against an annotated variable.
 */
export function exact<Shape, T extends Shape>(
  value: CheckExact<T, Shape>,
): Exact<Shape> {
  // the brand is a phantom type; nothing is added at runtime
  return value as Shape as Exact<Shape>;
}
