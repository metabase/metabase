import _ from "underscore";

import type {
  ExecuteActionParams,
  ExecuteActionResult,
} from "embedding-sdk-bundle/lib/execute-action";
import type { SdkActionInput } from "embedding-sdk-bundle/types/action";
import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";

export type MetabaseActionMock = {
  definition: unknown;
  respond: (
    parameters: NonNullable<ExecuteActionParams["parameters"]>,
  ) => Promise<ExecuteActionResult>;
};

type ActionHandlers = {
  executeAction: MetabaseEmbeddingSdkBundleExports["executeAction"];
};

function getActionLabel(input: SdkActionInput) {
  if (typeof input !== "object") {
    return String(input);
  }

  return String("name" in input.action ? input.action.name : input.action.id);
}

function createNoActionMockError(input: SdkActionInput) {
  return new Error(
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- developer-facing error naming SDK components
    `No mock for action "${getActionLabel(input)}". Pass mockDataAppAction for it in MetabaseTestProvider dataAppActions.`,
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
