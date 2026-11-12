import type { ActionDefinition, DefinedAction } from "./types";

/**
 * Defines a data app action: an implicit action of `kind` on a table from the
 * app's schema, which the dev preview runs without saving it. A production
 * build runs the action `entityId` names.
 */
export function defineAction<const TDefinition extends ActionDefinition>(
  definition: TDefinition,
): TDefinition & DefinedAction {
  // `DefinedAction` has no runtime member, so the object is returned as is; the
  // cast only adds the mark that a data app's `useAction` requires.
  return definition as TDefinition & DefinedAction;
}
