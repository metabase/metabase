import type { ActionSchema } from "./types";

type ActionDefinition = {
  action: ActionSchema;
  copiedActionId?: number;
};

/**
 * Defines a source-controlled data app action. `action` names the generated
 * action the app runs. `copiedActionId` is generated state — synchronization
 * writes it back, so never set or edit it by hand.
 */
export function defineAction<const TDefinition extends ActionDefinition>(
  definition: TDefinition,
): TDefinition {
  return definition;
}
