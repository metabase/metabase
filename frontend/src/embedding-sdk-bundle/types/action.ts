import type { SdkEntityId } from "embedding-sdk-bundle/types/entity";

/** How the raw SDK names an action: the id it was given. */
export type SdkActionId = number | SdkEntityId;

/**
 * How a data app names an action: the `defineAction` export, which is what a
 * data app must pass. `copiedActionEntityId` addresses the copy in the app's own
 * collection, the only one its viewers can read. The dev preview runs `action`
 * instead, so an app works before its resources are written.
 */
export type SdkActionDefinition = {
  action: { id: SdkActionId };
  copiedActionEntityId?: SdkEntityId;
};

export type SdkActionInput = SdkActionId | SdkActionDefinition;
