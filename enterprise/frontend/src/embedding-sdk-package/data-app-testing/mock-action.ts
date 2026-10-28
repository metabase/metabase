import type { ExecuteActionResult } from "embedding-sdk-bundle/lib/execute-action";
import type {
  ActionKindFromDataAppSchema,
  ActionParametersFromDataAppSchema,
  ActionResultForKind,
  ActionSchema,
  DefinedAction,
} from "embedding-sdk-package/hooks/public/use-action/types";

import { registerActionMock } from "./lib/action-mock-registry";
import {
  getActionParametersError,
  isActionParameters,
} from "./lib/action-parameters";

export type ActionMockCall<TParameters> = {
  parameters: TParameters;
};

export type ActionMock<TParameters> = {
  calls: () => readonly ActionMockCall<TParameters>[];
  lastCall: () => ActionMockCall<TParameters> | undefined;
};

export type ActionMockError<TAction extends { action: ActionSchema }> = {
  status?: number;
  message?: string;
  errors?: Partial<
    Record<TAction["action"]["parameters"][number]["slug"], string>
  >;
};

type MockedAction = DefinedAction & { action: ActionSchema };

type MockedActionParameters<TAction extends MockedAction> =
  ActionParametersFromDataAppSchema<TAction["action"]>;

function createActionMock<TAction extends MockedAction>(
  definition: TAction,
  respond: () => Promise<ExecuteActionResult>,
): ActionMock<MockedActionParameters<TAction>> {
  const calls: ActionMockCall<MockedActionParameters<TAction>>[] = [];

  registerActionMock({
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
  });

  return {
    calls: () => calls,
    lastCall: () => calls.at(-1),
  };
}

export function mockAction<TAction extends MockedAction>(
  action: TAction,
  result: ActionResultForKind<ActionKindFromDataAppSchema<TAction["action"]>>,
): ActionMock<MockedActionParameters<TAction>> {
  return createActionMock(action, () => Promise.resolve(result));
}

export function mockActionError<TAction extends MockedAction>(
  action: TAction,
  error: ActionMockError<TAction> = {},
): ActionMock<MockedActionParameters<TAction>> {
  return createActionMock(action, () =>
    Promise.reject({
      status: error.status ?? 500,
      data: { message: error.message, errors: error.errors ?? {} },
    }),
  );
}
