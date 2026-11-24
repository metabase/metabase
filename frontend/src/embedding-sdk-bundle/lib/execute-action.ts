import { translateEntityId } from "embedding-sdk-bundle/lib/translate-entity-id";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type {
  SdkActionDefinition,
  SdkActionId,
  SdkActionInput,
  SdkLegacyActionDefinition,
} from "embedding-sdk-bundle/types/action";
import {
  executeAction as executeActionMutation,
  executeUnsavedAction as executeUnsavedActionMutation,
} from "metabase/api/action";
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
): input is SdkActionDefinition => isObject(input) && "entityId" in input;

const isLegacyActionDefinition = (
  input: SdkActionInput,
): input is SdkLegacyActionDefinition =>
  isObject(input) && "action" in input && isObject(input.action);

function toRawActionId(input: SdkActionId): SdkActionId {
  if (isDataApp()) {
    throw new Error(
      `Action ${input} was passed to \`useAction\` as a raw id. A data app must pass a \`defineAction(...)\` definition.`,
    );
  }

  return input;
}

async function executeDefinedAction(
  reduxStore: SdkStore,
  definition: SdkActionDefinition,
  parameters: ActionParametersPayload,
): Promise<ExecuteActionResult> {
  if (isDataAppDev()) {
    return reduxStore
      .dispatch(
        executeUnsavedActionMutation.initiate({
          action: {
            name: definition.kind,
            type: "implicit",
            kind: definition.kind,
            table_id: definition.table.id,
          },
          // Forwarded unchanged: the SDK keeps the parameter bag loose, and the
          // endpoint validates the values server-side.
          parameters: parameters as ParametersForActionExecution,
        }),
      )
      .unwrap();
  }

  return executeSavedAction(reduxStore, definition.entityId, parameters);
}

async function executeSavedAction(
  reduxStore: SdkStore,
  actionId: SdkActionId,
  parameters: ActionParametersPayload,
): Promise<ExecuteActionResult> {
  const id =
    typeof actionId === "number"
      ? actionId
      : await translateEntityId(reduxStore, "action", actionId);

  return reduxStore
    .dispatch(
      executeActionMutation.initiate({
        id,
        // Forwarded unchanged: the SDK keeps the parameter bag loose, and the
        // endpoint validates the values server-side.
        parameters: parameters as ParametersForActionExecution,
      }),
    )
    .unwrap();
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
    if (isActionDefinition(actionId)) {
      return executeDefinedAction(reduxStore, actionId, parameters);
    }

    if (isLegacyActionDefinition(actionId)) {
      return executeSavedAction(reduxStore, actionId.action.id, parameters);
    }

    return reduxStore
      .dispatch(
        executeActionMutation.initiate({
          id: parseActionId(toRawActionId(actionId)),
          // Forwarded unchanged: the SDK keeps the parameter bag loose, and the
          // endpoint validates the values server-side.
          parameters: parameters as ParametersForActionExecution,
        }),
      )
      .unwrap();
  };
