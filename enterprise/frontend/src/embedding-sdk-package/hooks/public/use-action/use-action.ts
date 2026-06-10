import { useCallback, useState } from "react";

import type { ExecuteActionResult } from "embedding-sdk-bundle/lib/execute-action";
import type { SdkActionId } from "embedding-sdk-bundle/types/action";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

import { toActionExecuteError } from "./lib/to-action-execute-error";
import type {
  ActionExecuteError,
  ActionKind,
  ActionResultForKind,
} from "./types";

/**
 * @interface
 * @expand
 * @category useAction
 */
export type UseActionResult<
  TParameters extends Record<string, unknown> = Record<string, unknown>,
  TKind extends ActionKind | undefined = undefined,
> = {
  /**
   * Trigger the action with the given parameters. Returns the response body
   * on success AND throws on failure — the same error is stored in `error`
   * for render-time consumers. Resolves to the discriminated `result` shape
   * (see `ActionResultForKind<TKind>`); when `TKind` is omitted it resolves
   * to `AnyActionResult`, narrowable via `"<key>" in r`.
   *
   * Resolves to `null` (without making a request) when `actionId` is `null`
   * or the SDK is not yet initialized — guard the host-side caller with
   * `if (!actionId) return;` if these cases are reachable.
   */
  execute: (
    parameters: TParameters,
  ) => Promise<ActionResultForKind<TKind> | null>;
  isExecuting: boolean;
  /** Last response, or `null` before first call and after `reset()`. */
  result: ActionResultForKind<TKind> | null;
  /** Last thrown error, normalized to the public `ActionExecuteError` shape, or `null`. */
  error: ActionExecuteError | null;
  /** Clear `result` and `error`. */
  reset: () => void;
};

/**
 * Triggers a pre-existing Metabase action. The first arg is the action's
 * numeric id or its `entity_id` string; supply `TParameters` as the first
 * generic to type the `execute` argument, and optionally `TKind` as the
 * second generic to type the discriminated `result` shape.
 *
 * Without `TKind`, `result` defaults to a union of every possible response
 * body (`AnyActionResult`) — authors who don't know the kind upfront can
 * narrow with `"<key>" in result` instead of casting from
 * `Record<string, unknown>`.
 *
 *   useAction<{ name: string; email: string }, "create">(42);
 *
 * Unlike the query hooks, this does NOT run on mount — the caller invokes
 * `execute` explicitly from an event handler. To gate execution
 * conditionally, branch in the event handler (e.g.
 * `if (!user.canEdit) return;`) before calling `execute`.
 *
 * @function
 * @category useAction
 */
export const useAction = <
  TParameters extends Record<string, unknown> = Record<string, unknown>,
  TKind extends ActionKind | undefined = undefined,
>(
  actionId: SdkActionId | null,
): UseActionResult<TParameters, TKind> => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const executeAction =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.executeAction;

  const [result, setResult] = useState<ActionResultForKind<TKind> | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<ActionExecuteError | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const execute = useCallback(
    async (
      parameters: TParameters,
    ): Promise<ActionResultForKind<TKind> | null> => {
      if (actionId == null || !reduxStore || !executeAction) {
        return null;
      }

      setIsExecuting(true);
      setError(null);

      try {
        const raw: ExecuteActionResult = await executeAction(reduxStore)({
          actionId,
          parameters,
        });
        const next = raw as ActionResultForKind<TKind>;
        setResult(next);
        return next;
      } catch (err) {
        const adapted = toActionExecuteError(err);
        setError(adapted);
        setResult(null);
        throw adapted;
      } finally {
        setIsExecuting(false);
      }
    },
    [actionId, executeAction, reduxStore],
  );

  return {
    execute,
    isExecuting,
    result,
    error,
    reset,
  };
};
