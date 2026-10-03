import type { DefinedAction } from "./types";

/**
 * Defines a source-controlled data app action. `action` names the generated
 * action the app runs. `copiedActionEntityId` is the entity ID of the action's
 * copy in the app's `resources/actions/`, which a production build runs.
 */
export function defineAction<
  const TDefinition extends {
    action: { id: number; parameters: readonly unknown[] };
    copiedActionEntityId?: string;
  },
>(definition: TDefinition): TDefinition & DefinedAction {
  // `DefinedAction` has no runtime member, so the object is returned as is; the
  // cast only adds the mark that a data app's `useAction` requires.
  return definition as TDefinition & DefinedAction;
}
