import type { SdkEntityId } from "embedding-sdk-bundle/types/entity";

/** How the raw SDK names an action: the id it was given. */
export type SdkActionId = number | SdkEntityId;

/** How a data app names an action: the `defineAction` export. */
export type SdkActionDefinition = {
  action: { id: SdkActionId };
};

export type SdkActionInput = SdkActionId | SdkActionDefinition;
