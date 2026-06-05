import { POST } from "metabase/api/legacy-client";

export type ActionId = number;

export type ActionParametersPayload = Record<string, unknown>;

export type ExecuteActionParams = {
  actionId: ActionId;
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
 * Triggers a pre-existing Metabase action. The curried `() => fn` shape
 * mirrors `queryQuestion` / `queryMetric` so the package hook can read
 * `executeAction(reduxStore)({...})` off `window.METABASE_EMBEDDING_SDK_BUNDLE`.
 * The store isn't actually used today — the call is a same-origin POST.
 */
export const executeAction =
  () =>
  async ({
    actionId,
    parameters = {},
  }: ExecuteActionParams): Promise<ExecuteActionResult> => {
    return await POST(`/api/action/${actionId}/execute`)({ parameters });
  };
