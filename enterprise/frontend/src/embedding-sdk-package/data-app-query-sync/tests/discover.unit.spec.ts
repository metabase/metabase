import fs from "node:fs";

import {
  ACTION_DEFINITIONS,
  QUERY_DEFINITIONS,
  injectGeneratedId,
} from "../ast/query-source";
import { discoverActions, discoverQueries } from "../discover";
import { checkResourcesSynced } from "../sync";

import {
  FAKE_HASH,
  makeApp,
  setupResourceSyncTests,
  writeAction,
  writeQuery,
  writeQueryLockfile,
} from "./setup";

describe("query discovery", () => {
  setupResourceSyncTests();

  it("discovers a direct named definition", async () => {
    const appRoot = makeApp();
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 }, limit: 5 });`,
    );

    await expect(discoverQueries(appRoot)).resolves.toEqual([
      expect.objectContaining({
        exportName: "Orders",
        savedQuestionSourceId: 10,
        tableId: 1,
        hash: expect.stringMatching(/^v1:sha256:[a-f0-9]{64}$/),
      }),
    ]);
  });

  it("rejects copied saved question IDs", async () => {
    const appRoot = makeApp();

    writeQuery(
      appRoot,
      `export const First = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 } });
       export const Second = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 } });`,
    );

    await expect(discoverQueries(appRoot)).rejects.toThrow(
      "Saved question 10 is referenced by",
    );
  });

  it("replaces a quoted saved question ID", async () => {
    const appRoot = makeApp();
    const filePath = writeQuery(
      appRoot,
      `export const Orders = defineQuery({ "savedQuestionSourceId": 10, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);

    injectGeneratedId(query, QUERY_DEFINITIONS, 20);

    const contents = fs.readFileSync(filePath, "utf8");
    expect(contents).toContain("savedQuestionSourceId: 20");
    expect(contents).not.toContain('savedQuestionSourceId": 10');
  });

  it.each([
    ["a shorthand ID", "savedQuestionSourceId"],
    ["a spread ID", "...defaults"],
    [
      "an explicit ID followed by a spread",
      "savedQuestionSourceId: 10, ...defaults",
    ],
  ])("reuses the generated query ID instead of %s", async (_, properties) => {
    const appRoot = makeApp();

    writeQuery(
      appRoot,
      `const savedQuestionSourceId = 10;
       const defaults = { savedQuestionSourceId };
       export const Orders = defineQuery({ ${properties}, source: { type: "table", id: 1 } });`,
    );

    const [query] = await discoverQueries(appRoot);
    injectGeneratedId(query, QUERY_DEFINITIONS, 20);

    const [updatedQuery] = await discoverQueries(appRoot);
    expect(updatedQuery.savedQuestionSourceId).toBe(20);
    injectGeneratedId(updatedQuery, QUERY_DEFINITIONS, 30);

    const [recoveredQuery] = await discoverQueries(appRoot);
    expect(recoveredQuery.savedQuestionSourceId).toBe(30);
  });

  it("fails a read-only build check when source and lockfile drift", async () => {
    const appRoot = makeApp();

    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 }, limit: 5 });`,
    );

    writeQueryLockfile(appRoot, [
      {
        tableId: 1,
        hash: FAKE_HASH,
        savedQuestionSourceId: 10,
      },
    ]);

    await expect(checkResourcesSynced(appRoot)).rejects.toThrow(
      "is not synchronized",
    );
  });
});

describe("action discovery", () => {
  setupResourceSyncTests();

  it("discovers named definitions and the action each references", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const Create = defineAction({ copiedActionId: 91, action: { id: 51, parameters: [] } });
       export const Update = defineAction({ action: { id: 52, parameters: [] } });`,
    );

    const discovered = await discoverActions(appRoot);

    expect(
      discovered.map(({ exportName, sourceActionId, copiedActionId }) => ({
        exportName,
        sourceActionId,
        copiedActionId,
      })),
    ).toEqual([
      { exportName: "Create", sourceActionId: 51, copiedActionId: 91 },
      { exportName: "Update", sourceActionId: 52, copiedActionId: undefined },
    ]);
  });

  it("reuses the generated action ID instead of shorthand and spread IDs", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `const copiedActionId = 91;
       const defaults = { copiedActionId };
       export const Create = defineAction({ copiedActionId, ...defaults, action: { id: 51, parameters: [] } });`,
    );

    const [action] = await discoverActions(appRoot);
    injectGeneratedId(action, ACTION_DEFINITIONS, 92);

    const [updatedAction] = await discoverActions(appRoot);
    expect(updatedAction.copiedActionId).toBe(92);
  });

  it("rejects two definitions claiming the same source action", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const First = defineAction({ action: { id: 51, parameters: [] } });
       export const Second = defineAction({ action: { id: 51, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      "Action 51 is referenced by",
    );
  });

  it("rejects a copied definition that carries another's generated ID", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const First = defineAction({ copiedActionId: 91, action: { id: 51, parameters: [] } });
       export const Second = defineAction({ copiedActionId: 91, action: { id: 52, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      "Generated action 91 is referenced by",
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

  it("rejects a hand-edited generated ID", async () => {
    const appRoot = makeApp();

    writeAction(
      appRoot,
      `export const Create = defineAction({ copiedActionId: 0, action: { id: 51, parameters: [] } });`,
    );

    await expect(discoverActions(appRoot)).rejects.toThrow(
      "has an invalid copiedActionId",
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
