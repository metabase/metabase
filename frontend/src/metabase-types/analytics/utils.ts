/**
 * 1. Omits all `TEvent` properties that are not present in the `TSchema`.
 * 2. Checks that remaining `TEvent` properties are assignable to the `TSchema`.
 */
export type ValidateSchema<TEvent extends TSchema, TSchema> = Pick<
  TEvent,
  Extract<keyof TEvent, keyof TSchema>
>;
