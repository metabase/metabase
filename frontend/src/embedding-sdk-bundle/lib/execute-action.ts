import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type {
  SdkActionDefinition,
  SdkActionId,
  SdkActionInput,
} from "embedding-sdk-bundle/types/action";
import { executeAction as executeActionMutation } from "metabase/api/action";
import { isDataApp, isDataAppDev } from "metabase/embedding-sdk/config";
import type {
  BaseEntityId,
  ParametersForActionExecution,
  WritebackActionId,
} from "metabase-types/api";
import { isBaseEntityID } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

type ActionParametersPayload = Record<string, unknown>;

export type ExecuteActionParams = {
  actionId: SdkActionInput;
  parameters?: ActionParametersPayload;
};

/**
 * Loose response shape from the execute-action endpoint. The body varies
 * by action kind (created-row / rows-updated / rows-deleted / rows-affected
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

const isActionDefinition = (
  input: SdkActionInput,
): input is SdkActionDefinition => isObject(input) && "action" in input;

/**
 * The action that actually runs. Outside the dev preview the synchronized copy
 * replaces the authored action: the copy is what grants an app's viewers
 * permission to run it, through the collection its model lives in.
 */
function toExecutableActionId(input: SdkActionInput): SdkActionId {
  if (!isActionDefinition(input)) {
    // Raw ids address the authored action, which an app's viewers cannot read.
    if (isDataApp() && !isDataAppDev()) {
      throw new Error(
        `Action ${input} was passed to \`useAction\` as a raw id. A data app must pass the \`defineAction(...)\` export, so the synchronized action runs.`,
      );
    }

    return input;
  }

  if (isDataAppDev()) {
    return input.action.id;
  }

  if (input.copiedActionId === null || input.copiedActionId === undefined) {
    throw new Error(
      "This action has not been synchronized. Run `npm run sync-resources` and rebuild.",
    );
  }

  return input.copiedActionId;
}

/**
 * Triggers a pre-existing Metabase action. The curried `(store) => fn` shape
 * mirrors `createDashboard` / `queryQuestion` so the package
 * hook can read `executeAction(reduxStore)({...})` off
 * `window.METABASE_EMBEDDING_SDK_BUNDLE`. The action runs by dispatching the
 * `metabase/api` execute-action mutation on the passed store.
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
          id: parseActionId(toExecutableActionId(actionId)),
          // Forwarded unchanged: the SDK keeps the parameter bag loose, and the
          // endpoint validates the values server-side.
          parameters: parameters as ParametersForActionExecution,
        }),
      )
      .unwrap();
  };
