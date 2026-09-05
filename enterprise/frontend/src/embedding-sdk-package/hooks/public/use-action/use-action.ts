import { useCallback, useState } from "react";

import type { ExecuteActionResult } from "embedding-sdk-bundle/lib/execute-action";
import type { SdkActionInput } from "embedding-sdk-bundle/types/action";
import { useMetabaseProviderPropsStore } from "embedding-sdk-package/lib/provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

import { toActionExecuteError } from "./lib/to-action-execute-error";
import type {
  ActionExecuteError,
  ActionKind,
  ActionResultForKind,
  UseAction,
  UseActionResult,
} from "./types";

/**
 * Triggers a pre-existing Metabase action.
 *
 * Unlike the query hooks, this does NOT run on mount — the caller invokes
 * `execute` explicitly from an event handler. To gate execution
 * conditionally, branch in the event handler (e.g.
 * `if (!user.canEdit) return;`) before calling `execute`.
 *
 * @function
 * @category useAction
 */
const useActionImpl = <
  TParameters extends Record<string, unknown> = Record<string, unknown>,
  TKind extends ActionKind | undefined = undefined,
>(
  actionId: SdkActionInput | null,
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
        // Unjustified type cast. FIXME
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

/** @notExported UseAction */
export const useAction: UseAction = useActionImpl;
