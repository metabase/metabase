import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";

import type { ParameterChangePayload } from "./dashboard";
import type { SdkEntityId } from "./entity";
import type { SqlParameterChangePayload } from "./question";

/**
 * Opaque ID of one visit to an entity the user reached through entity navigation.
 *
 * @category Dashboard
 */
export type NavigationId = string;

/**
 * Parameter values for entities the user reaches through entity navigation, keyed by {@link NavigationId}.
 *
 * @category Dashboard
 */
export type NavigatedEntityParameters = Record<NavigationId, ParameterValues>;

/**
 * @inline
 */
export type NavigatedEntityFields = {
  /** Entity ID of the dashboard or question on screen. */
  entityId: SdkEntityId;
  /** The values the click behavior set, in the same shape as `parameters`. Empty when the click maps no filter. */
  clickParameters: ParameterValues;
  /**
   * Opaque ID of this visit. A new navigation gets a new ID, going back keeps it.
   * Use it as the key in `navigatedEntityParameters`.
   */
  navigationId: NavigationId;
};

/**
 * Payload passed to `onNavigatedEntityParametersChange` callback.
 * The root payload of the same entity type, plus `entityType`, `entityId`, `navigationId` and `clickParameters`.
 *
 * @category Dashboard
 */
export type NavigatedEntityParameterChangePayload =
  | (ParameterChangePayload &
      NavigatedEntityFields & { entityType: "dashboard" })
  | (SqlParameterChangePayload &
      NavigatedEntityFields & { entityType: "question" });
