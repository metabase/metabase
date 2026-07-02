import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { SdkActionId } from "embedding-sdk-bundle/types/action";
import { executeAction as executeActionMutation } from "metabase/api/action";
import type {
  BaseEntityId,
  ParametersForActionExecution,
  WritebackActionId,
} from "metabase-types/api";
import { isBaseEntityID } from "metabase-types/api";

type ActionParametersPayload = Record<string, unknown>;

export type ExecuteActionParams = {
  actionId: SdkActionId;
  parameters?: ActionParametersPayload;
};

/**
 * Loose response shape from the execute-action endpoint. The body varies by
 * action kind (created-row / rows-updated / rows-deleted / rows-affected /
 * success+counts). Per-kind discrimination happens in the package hook via the
 * generated `ActionResult<TAction>` type — this lib stays loose.
 *
 * HTTP actions are rejected at the backend and never reach this code path.
 */
export type ExecuteActionResult = Record<string, unknown>;

/**
 * Narrows the SDK's loose `SdkActionId` (which keeps entity ids as a plain
 * string for ergonomics) into the id the endpoint accepts: a numeric action id
 * or a branded `entity_id`. Throws on a string that is neither.
 */
const parseActionId = (
  actionId: SdkActionId,
): WritebackActionId | BaseEntityId => {
  if (typeof actionId === "number" || isBaseEntityID(actionId)) {
    return actionId;
  }
  throw new Error(`Invalid action id: ${actionId}`);
};

/**
 * Triggers a pre-existing Metabase action. The curried `(store) => fn` shape
 * mirrors `createDashboard` / `queryQuestion` / `queryMetric` so the package
 * hook can read `executeAction(reduxStore)({...})` off
 * `window.METABASE_EMBEDDING_SDK_BUNDLE`.
 */
export const executeAction =
  (reduxStore: SdkStore) =>
  async ({
    actionId,
    parameters = {},
  }: ExecuteActionParams): Promise<ExecuteActionResult> => {
    return reduxStore
      .dispatch(
        executeActionMutation.initiate({
          id: parseActionId(actionId),
          // Forwarded unchanged: the SDK keeps the parameter bag loose, and the
          // endpoint validates the values server-side.
          parameters: parameters as ParametersForActionExecution,
        }),
      )
      .unwrap();
  };
