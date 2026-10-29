import type { ExecuteActionResult } from "embedding-sdk-bundle/lib/execute-action";
import type {
  ActionKindFromDataAppSchema,
  ActionParametersFromDataAppSchema,
  ActionResultForKind,
  ActionSchema,
} from "embedding-sdk-package/hooks/public/use-action/types";
import type { MetabaseActionMock } from "embedding-sdk-package/testing/lib/private/actions";

import {
  getActionParametersError,
  isActionParameters,
} from "../private/action-parameters";

export type DataAppActionMockCall<TParameters> = {
  parameters: TParameters;
};

export type DataAppActionMock<TParameters> = MetabaseActionMock & {
  calls: () => readonly DataAppActionMockCall<TParameters>[];
  lastCall: () => DataAppActionMockCall<TParameters> | undefined;
};

export type DataAppActionMockError<TAction extends { action: ActionSchema }> = {
  status?: number;
  message?: string;
  errors?: Partial<
    Record<TAction["action"]["parameters"][number]["slug"], string>
  >;
};

type MockedAction = { action: ActionSchema };

type MockedActionParameters<TAction extends MockedAction> =
  ActionParametersFromDataAppSchema<TAction["action"]>;

function createActionMock<TAction extends MockedAction>(
  definition: TAction,
  respond: () => Promise<ExecuteActionResult>,
): DataAppActionMock<MockedActionParameters<TAction>> {
  const calls: DataAppActionMockCall<MockedActionParameters<TAction>>[] = [];

  return {
    definition,
    respond: (parameters) => {
      if (
        !isActionParameters<TAction["action"]>(definition.action, parameters)
      ) {
        return Promise.reject(
          new Error(
            `Invalid parameters for action "${definition.action.name ?? definition.action.id}": ${getActionParametersError(definition.action, parameters)}.`,
          ),
        );
      }

      calls.push({ parameters });

      return respond();
    },
    calls: () => calls,
    lastCall: () => calls.at(-1),
  };
}

export function mockDataAppAction<TAction extends MockedAction>(
  action: TAction,
  result: ActionResultForKind<ActionKindFromDataAppSchema<TAction["action"]>>,
): DataAppActionMock<MockedActionParameters<TAction>> {
  return createActionMock(action, () => Promise.resolve(result));
}

export function mockDataAppActionError<TAction extends MockedAction>(
  action: TAction,
  error: DataAppActionMockError<TAction> = {},
): DataAppActionMock<MockedActionParameters<TAction>> {
  return createActionMock(action, () =>
    Promise.reject({
      status: error.status ?? 500,
      data: { message: error.message, errors: error.errors ?? {} },
    }),
  );
}
