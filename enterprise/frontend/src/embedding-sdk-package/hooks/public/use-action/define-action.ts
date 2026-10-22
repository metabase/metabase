import type { DefinedAction } from "./types";

/**
 * Defines a data app action. `action.id` is the action's entity ID or its
 * numeric id. The typed schema Metabase generates for an app holds one
 * definition per action in the app's collection.
 */
export function defineAction<
  const TDefinition extends {
    action: { id: number | string; parameters: readonly unknown[] };
  },
>(definition: TDefinition): TDefinition & DefinedAction {
  // `DefinedAction` has no runtime member, so the object is returned as is; the
  // cast only adds the mark that a data app's `useAction` requires.
  return definition as TDefinition & DefinedAction;
}
