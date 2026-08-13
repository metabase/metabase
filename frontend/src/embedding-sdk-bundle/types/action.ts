import type { SdkEntityId } from "embedding-sdk-bundle/types/entity";

export type SdkActionId = number | SdkEntityId;

/**
 * A source-controlled action definition, as `defineAction` returns it.
 * `copiedActionId` addresses the copy synchronization made in the app's own
 * collection — the only one its viewers can read. The dev preview runs
 * `action` instead, so an app works before its first synchronization.
 */
export type SdkActionDefinition = {
  action: { id: SdkActionId };
  copiedActionId?: number;
};

export type SdkActionInput = SdkActionId | SdkActionDefinition;
