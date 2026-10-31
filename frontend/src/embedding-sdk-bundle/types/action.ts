import type { SdkEntityId } from "embedding-sdk-bundle/types/entity";

/** How the raw SDK names an action: the id it was given. */
export type SdkActionId = number | SdkEntityId;

/**
 * How a data app names an action: a `defineAction` definition of an implicit
 * action on a table. The dev preview runs it without saving it, and a
 * production build runs the action `entityId` names.
 */
export type SdkActionDefinition = {
  entityId: SdkEntityId;
  kind: "row/create" | "row/update" | "row/delete";
  table: { id: number };
};

/**
 * How a data app built against an older SDK names an action: the saved action
 * `action.id` names, by its entity ID or numeric id.
 *
 * @deprecated A data app passes a `defineAction` definition with `entityId`.
 */
export type SdkLegacyActionDefinition = {
  action: { id: SdkActionId };
};

export type SdkActionInput =
  | SdkActionId
  | SdkActionDefinition
  | SdkLegacyActionDefinition;
