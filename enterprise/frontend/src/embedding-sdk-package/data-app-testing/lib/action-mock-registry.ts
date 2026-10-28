import type {
  ExecuteActionParams,
  ExecuteActionResult,
} from "embedding-sdk-bundle/lib/execute-action";
import type { SdkActionInput } from "embedding-sdk-bundle/types/action";
import type { ActionSchema } from "embedding-sdk-package/hooks/public/use-action/types";
import { getMockSdkRegistry } from "embedding-sdk-package/testing/lib/mock-sdk-registry";

export type ActionMockEntry = {
  definition: { action: ActionSchema };
  respond: (
    parameters: Record<string, unknown>,
  ) => Promise<ExecuteActionResult>;
};

const entries: ActionMockEntry[] = [];

const getActionId = (input: SdkActionInput) =>
  typeof input === "object" ? input.action.id : input;

const createNoMockError = (input: SdkActionInput) => {
  const name =
    typeof input === "object" && "name" in input.action
      ? input.action.name
      : getActionId(input);

  return new Error(
    `No mock for action "${String(name)}". Call mockAction for it before rendering.`,
  );
};

const answerAction = ({
  actionId,
  parameters = {},
}: ExecuteActionParams): Promise<ExecuteActionResult> => {
  const entry = entries.find(
    ({ definition }) =>
      definition === actionId || definition.action.id === getActionId(actionId),
  );

  return entry
    ? entry.respond(parameters)
    : Promise.reject(createNoMockError(actionId));
};

const installActionMockHandlers = () => {
  const { handlers, resets } = getMockSdkRegistry();

  handlers.executeAction = () => answerAction;
  resets.add(() => entries.splice(0));
};

installActionMockHandlers();

export const registerActionMock = (entry: ActionMockEntry) => {
  const replacedIndex = entries.findIndex(
    ({ definition }) => definition === entry.definition,
  );

  if (replacedIndex >= 0) {
    entries.splice(replacedIndex, 1);
  }

  entries.unshift(entry);
};
