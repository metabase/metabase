import { discoverActions, discoverQueries } from "../discover";

import { makeApp, setupResourceTests, writeAction, writeQuery } from "./setup";

const QUESTION_10 = "questionEntityId00010";
const ACTION_91 = "actionEntityId0000091";

describe("query discovery", () => {
  setupResourceTests();

  it("discovers a direct named definition", async () => {
    const appRoot = makeApp();
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION_10}", source: { type: "table", id: 1 }, limit: 5 });`,
    );

    await expect(discoverQueries(appRoot)).resolves.toEqual([
      expect.objectContaining({
        exportName: "Orders",
        savedQuestionEntityId: QUESTION_10,
      }),
    ]);
  });

  it("rejects a saved question ID two definitions share", async () => {
    const appRoot = makeApp();

    writeQuery(
      appRoot,
      `export const First = defineQuery({ savedQuestionEntityId: "${QUESTION_10}", source: { type: "table", id: 1 } });
       export const Second = defineQuery({ savedQuestionEntityId: "${QUESTION_10}", source: { type: "table", id: 1 } });`,
    );

    await expect(discoverQueries(appRoot)).rejects.toThrow(
      `Saved question ${QUESTION_10} is referenced by`,
    );
  });

  it("rejects an invalid saved question ID", async () => {
    const appRoot = makeApp();

    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionEntityId: 10, source: { type: "table", id: 1 } });`,
    );

    await expect(discoverQueries(appRoot)).rejects.toThrow(
      "has an invalid savedQuestionEntityId",
    );
  });
});

describe("action discovery", () => {
  setupResourceTests();

  it("discovers named definitions and the action each references", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const Create = defineAction({ copiedActionEntityId: "${ACTION_91}", action: { id: 51, entityId: "sourceActionEntity051", parameters: [] } });
       export const Update = defineAction({ action: { id: 52, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).resolves.toEqual([
      expect.objectContaining({
        exportName: "Create",
        sourceActionId: 51,
        copiedActionEntityId: ACTION_91,
      }),
      expect.objectContaining({
        exportName: "Update",
        sourceActionId: 52,
        copiedActionEntityId: undefined,
      }),
    ]);
  });

  it("rejects two definitions claiming the same source action", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const First = defineAction({ action: { id: 51, parameters: [] } });
       export const Second = defineAction({ action: { id: 51, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      /Action 51 is referenced by .*\. Declare each action once\./,
    );
  });

  it("rejects a copied definition that carries another's copied action ID", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const First = defineAction({ copiedActionEntityId: "${ACTION_91}", action: { id: 51, parameters: [] } });
       export const Second = defineAction({ copiedActionEntityId: "${ACTION_91}", action: { id: 52, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      `Copied action ${ACTION_91} is referenced by`,
    );
  });

  it("rejects a definition that does not reference a generated action", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const Create = defineAction({ action: { name: "not a schema entry" } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      "must reference a generated action",
    );
  });

  it("rejects an invalid copied action ID", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const Create = defineAction({ copiedActionEntityId: 91, action: { id: 51, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      "has an invalid copiedActionEntityId",
    );
  });

  it("requires a definition to initialize an exported variable", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `const Create = defineAction({ action: { id: 51, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      "defineAction must directly initialize a named exported variable",
    );
  });
});
