import _ from "underscore";

import type { ExecuteActionResult } from "embedding-sdk-bundle/lib/execute-action";
import type { SdkActionInput } from "embedding-sdk-bundle/types/action";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";

import type { ActionParameters } from "./action-parameters";
import { TEST_PROVIDER_NAME } from "./constants";

export type MetabaseActionMock = {
  definition: SdkActionInput;
  respond: (parameters: ActionParameters) => Promise<ExecuteActionResult>;
};

type ActionHandlers = {
  executeAction: MetabaseEmbeddingSdkBundleExports["executeAction"];
};

function getActionLabel(input: SdkActionInput) {
  if (typeof input !== "object") {
    return String(input);
  }

  return String("entityId" in input ? input.entityId : input.action.id);
}

function createNoActionMockError(input: SdkActionInput) {
  return new Error(
    `No mock for action "${getActionLabel(input)}". Pass mockDataAppAction for it in ${TEST_PROVIDER_NAME} dataAppActions.`,
  );
}

export function createActionHandlers(
  actions: readonly MetabaseActionMock[],
): ActionHandlers {
  return {
    executeAction:
      () =>
      async ({ actionId, parameters = {} }) => {
        const mock = actions.find(({ definition }) =>
          _.isEqual(definition, actionId),
        );

        if (!mock) {
          throw createNoActionMockError(actionId);
        }

        return mock.respond(parameters);
      },
  };
}
