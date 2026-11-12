import type { ExecuteActionResult } from "embedding-sdk-bundle/lib/execute-action";
import type {
  ActionDefinition,
  ActionKindFromDefinition,
  ActionParametersFromDefinition,
  ActionResultForKind,
} from "embedding-sdk-package/hooks/public/use-action/types";
import type { MetabaseActionMock } from "embedding-sdk-package/testing/lib/private/actions";
import {
  type MockCalls,
  createMockCalls,
} from "embedding-sdk-package/testing/lib/private/mock-calls";

import {
  getActionParametersError,
  isActionParameters,
} from "../private/action-parameters";

import type { DataAppMockError } from "./data-app-queries";

export type DataAppActionMockCall<TParameters> = {
  parameters: TParameters;
};

export type DataAppActionMock<TParameters> = MetabaseActionMock &
  MockCalls<DataAppActionMockCall<TParameters>>;

export type DataAppActionMockError<TAction extends ActionDefinition> =
  DataAppMockError & {
    errors?: Partial<
      Record<keyof ActionParametersFromDefinition<TAction>, string>
    >;
  };

function createActionMock<TAction extends ActionDefinition>(
  definition: TAction,
  respond: () => Promise<ExecuteActionResult>,
): DataAppActionMock<ActionParametersFromDefinition<TAction>> {
  const calls =
    createMockCalls<
      DataAppActionMockCall<ActionParametersFromDefinition<TAction>>
    >();

  return {
    definition,
    respond: (parameters) => {
      if (!isActionParameters(definition, parameters)) {
        return Promise.reject(
          new Error(
            `Invalid parameters for action "${definition.entityId}": ${getActionParametersError(definition, parameters)}.`,
          ),
        );
      }

      calls.record({ parameters });

      return respond();
    },
    calls: calls.calls,
    lastCall: calls.lastCall,
  };
}

export function mockDataAppAction<TAction extends ActionDefinition>(
  action: TAction,
  result: ActionResultForKind<ActionKindFromDefinition<TAction>>,
): DataAppActionMock<ActionParametersFromDefinition<TAction>> {
  return createActionMock(action, () => Promise.resolve(result));
}

export function mockDataAppActionError<TAction extends ActionDefinition>(
  action: TAction,
  error: DataAppActionMockError<TAction> = {},
): DataAppActionMock<ActionParametersFromDefinition<TAction>> {
  return createActionMock(action, () =>
    Promise.reject({
      status: error.status ?? 500,
      data: { message: error.message, errors: error.errors ?? {} },
    }),
  );
}
