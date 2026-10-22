import type { SdkEntityId } from "embedding-sdk-bundle/types/entity";

/** How the raw SDK names an action: the id it was given. */
export type SdkActionId = number | SdkEntityId;

/**
 * How a data app names an action: a `defineAction` definition from the app's
 * typed schema, whose `action.id` is the entity ID of an action in the app's
 * collection.
 */
export type SdkActionDefinition = {
  action: { id: SdkActionId };
};

export type SdkActionInput = SdkActionId | SdkActionDefinition;
