import fs from "node:fs";
import path from "node:path";

import { checkResources } from "../check";

import {
  makeApp,
  setupResourceTests,
  writeAction,
  writeQuery,
  writeResource,
} from "./setup";

const QUESTION = "questionEntityId00010";
const METRIC = "metricCopyEntityId001";
const ACTION = "actionCopyEntityId001";

const cardFile = (entityId: string, type: string) => ({
  name: entityId,
  type,
  entity_id: entityId,
  "serdes/meta": [{ model: "Card", id: entityId }],
});

const actionFile = (entityId: string) => ({
  name: "Create",
  type: "query",
  entity_id: entityId,
  "serdes/meta": [{ model: "Action", id: entityId }],
});

/** An app whose resources back its one query and one action. */
function checkedApp() {
  const appRoot = makeApp();
  writeQuery(
    appRoot,
    `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 } });`,
  );
  writeAction(
    appRoot,
    `export const Create = defineAction({ copiedActionEntityId: "${ACTION}", action: { id: 51, parameters: [] } });`,
  );
  writeResource(appRoot, "cards/orders.yaml", cardFile(QUESTION, "question"));
  writeResource(appRoot, "cards/revenue.yaml", cardFile(METRIC, "metric"));
  writeResource(appRoot, "actions/create.yaml", actionFile(ACTION));
  return appRoot;
}

describe("resource check", () => {
  setupResourceTests();

  it("passes when every definition's file exists and nothing is left over", async () => {
    await expect(checkResources(checkedApp())).resolves.toBeUndefined();
  });

  it("fails for a query without a saved question ID", async () => {
    const appRoot = checkedApp();
    fs.appendFileSync(
      path.join(appRoot, "queries/orders.query.ts"),
      `export const Products = defineQuery({ source: { type: "table", id: 2 } });\n`,
    );

    await expect(checkResources(appRoot)).rejects.toThrow(
      "queries/orders.query.ts:Products has no savedQuestionEntityId.",
    );
  });

  it("fails for a query whose saved question has no file", async () => {
    const appRoot = checkedApp();
    fs.rmSync(path.join(appRoot, "resources/cards/orders.yaml"));

    await expect(checkResources(appRoot)).rejects.toThrow(
      `queries/orders.query.ts:Orders names saved question ${QUESTION}, which no file in resources/cards/ holds.`,
    );
  });

  it("ignores hidden files, which a pull skips", async () => {
    const appRoot = checkedApp();
    fs.renameSync(
      path.join(appRoot, "resources/cards/orders.yaml"),
      path.join(appRoot, "resources/cards/.orders.yaml"),
    );

    await expect(checkResources(appRoot)).rejects.toThrow(
      `names saved question ${QUESTION}, which no file in resources/cards/ holds.`,
    );
  });

  it("fails for a query that names a card that is not a question", async () => {
    const appRoot = checkedApp();
    writeResource(appRoot, "cards/orders.yaml", cardFile(QUESTION, "metric"));

    await expect(checkResources(appRoot)).rejects.toThrow(
      "queries/orders.query.ts:Orders names resources/cards/orders.yaml, which is not a question.",
    );
  });

  it("fails for an action without a copied action ID", async () => {
    const appRoot = checkedApp();
    fs.appendFileSync(
      path.join(appRoot, "actions/orders.action.ts"),
      `export const Update = defineAction({ action: { id: 52, parameters: [] } });\n`,
    );

    await expect(checkResources(appRoot)).rejects.toThrow(
      "actions/orders.action.ts:Update has no copiedActionEntityId.",
    );
  });

  it("fails for an action whose copy has no file", async () => {
    const appRoot = checkedApp();
    fs.rmSync(path.join(appRoot, "resources/actions/create.yaml"));

    await expect(checkResources(appRoot)).rejects.toThrow(
      `actions/orders.action.ts:Create names action ${ACTION}, which no file in resources/actions/ holds.`,
    );
  });

  it.each([
    [
      "a question no query names",
      "cards/stale.yaml",
      cardFile("staleQuestionEntity01", "question"),
      "resources/cards/stale.yaml is a question no definition names. Delete it.",
    ],
    [
      "an action no definition names",
      "actions/stale.yaml",
      actionFile("staleActionEntityId01"),
      "resources/actions/stale.yaml is an action no definition names. Delete it.",
    ],
  ])("fails for %s", async (_, relativePath, entity, message) => {
    const appRoot = checkedApp();
    writeResource(appRoot, relativePath, entity);

    await expect(checkResources(appRoot)).rejects.toThrow(message);
  });

  it("reports an action no definition names even when a query names the same ID", async () => {
    const appRoot = checkedApp();
    writeResource(appRoot, "actions/stale.yaml", actionFile(QUESTION));

    await expect(checkResources(appRoot)).rejects.toThrow(
      "resources/actions/stale.yaml is an action no definition names. Delete it.",
    );
  });

  it("reports a question file without an entity ID even when a definition lacks one too", async () => {
    const appRoot = checkedApp();
    fs.appendFileSync(
      path.join(appRoot, "queries/orders.query.ts"),
      `export const Products = defineQuery({ source: { type: "table", id: 2 } });\n`,
    );
    writeResource(appRoot, "cards/unnamed.yaml", {
      name: "Unnamed",
      type: "question",
    });

    await expect(checkResources(appRoot)).rejects.toThrow(
      "resources/cards/unnamed.yaml is a question no definition names. Delete it.",
    );
  });

  it("reports every problem at once", async () => {
    const appRoot = checkedApp();
    fs.rmSync(path.join(appRoot, "resources/cards/orders.yaml"));
    fs.rmSync(path.join(appRoot, "resources/actions/create.yaml"));

    const error = await checkResources(appRoot).catch((e: Error) => e);
    expect(String(error)).toContain(`saved question ${QUESTION}`);
    expect(String(error)).toContain(`action ${ACTION}`);
  });
});
