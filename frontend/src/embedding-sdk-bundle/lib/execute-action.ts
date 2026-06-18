import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { SdkActionId } from "embedding-sdk-bundle/types/action";
import { api } from "metabase/api/client";

type ActionParametersPayload = Record<string, unknown>;

export type ExecuteActionParams = {
  actionId: SdkActionId;
  parameters?: ActionParametersPayload;
};

/**
 * Loose response shape from `POST /api/action/:id/execute`. The body varies
 * by action kind (created-row / rows-updated / rows-deleted / rows-affected
 * / success+counts). Per-kind discrimination happens in the package hook
 * via the generated `ActionResult<TAction>` type — this lib stays loose.
 *
 * HTTP actions are rejected at the backend and never reach this code path.
 */
export type ExecuteActionResult = Record<string, unknown>;

/**
 * Triggers a pre-existing Metabase action. The curried `(store) => fn`
 * shape mirrors `createDashboard` / `queryQuestion` / `queryMetric` so the
 * package hook can read `executeAction(reduxStore)({...})` off
 * `window.METABASE_EMBEDDING_SDK_BUNDLE`. The store isn't actually used
 * today — the call is a same-origin POST — but the signature is preserved
 * for parity with the other bundle utilities.
 */
export const executeAction =
  (_reduxStore: SdkStore) =>
  async ({
    actionId,
    parameters = {},
  }: ExecuteActionParams): Promise<ExecuteActionResult> => {
    return (await api.request({
      method: "POST",
      url: `/api/action/${actionId}/execute`,
      body: { parameters },
    })) as ExecuteActionResult;
  };
