import fs from "node:fs";
import path from "node:path";

import { checkResources } from "../check";

import {
  COLLECTION,
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

/** An app whose collection files back its one query and one action. */
function checkedApp(options?: Parameters<typeof makeApp>[0]) {
  const appRoot = makeApp(options);
  writeQuery(
    appRoot,
    `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 } });`,
  );
  writeAction(
    appRoot,
    `export const Create = defineAction({ copiedActionEntityId: "${ACTION}", action: { id: 51, parameters: [] } });`,
  );
  writeResource(
    appRoot,
    "data_app/orders.yaml",
    cardFile(QUESTION, "question"),
  );
  writeResource(appRoot, "data_app/revenue.yaml", cardFile(METRIC, "metric"));
  writeResource(appRoot, "data_app/create.yaml", actionFile(ACTION));
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
    fs.rmSync(path.join(appRoot, "collections/data_apps/data_app/orders.yaml"));

    await expect(checkResources(appRoot)).rejects.toThrow(
      `queries/orders.query.ts:Orders names saved question ${QUESTION}, which no file in collections/data_apps/ holds in the app's collection.`,
    );
  });

  it("ignores hidden files, which a pull skips", async () => {
    const appRoot = checkedApp();
    fs.renameSync(
      path.join(appRoot, "collections/data_apps/data_app/orders.yaml"),
      path.join(appRoot, "collections/data_apps/data_app/.orders.yaml"),
    );

    await expect(checkResources(appRoot)).rejects.toThrow(
      `names saved question ${QUESTION}, which no file in collections/data_apps/ holds in the app's collection.`,
    );
  });

  it("fails for a query that names a card that is not a question", async () => {
    const appRoot = checkedApp();
    writeResource(
      appRoot,
      "data_app/orders.yaml",
      cardFile(QUESTION, "metric"),
    );

    await expect(checkResources(appRoot)).rejects.toThrow(
      "queries/orders.query.ts:Orders names collections/data_apps/data_app/orders.yaml, which is not a question.",
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
    fs.rmSync(path.join(appRoot, "collections/data_apps/data_app/create.yaml"));

    await expect(checkResources(appRoot)).rejects.toThrow(
      `actions/orders.action.ts:Create names action ${ACTION}, which no file in collections/data_apps/ holds in the app's collection.`,
    );
  });

  it.each([
    [
      "a question no query names",
      "data_app/stale.yaml",
      cardFile("staleQuestionEntity01", "question"),
      "collections/data_apps/data_app/stale.yaml is a resource that is not referenced anywhere.",
    ],
    [
      "an action no definition names",
      "data_app/stale.yaml",
      actionFile("staleActionEntityId01"),
      "collections/data_apps/data_app/stale.yaml is a resource that is not referenced anywhere.",
    ],
  ])("fails for %s", async (_, relativePath, entity, message) => {
    const appRoot = checkedApp();
    writeResource(appRoot, relativePath, entity);

    await expect(checkResources(appRoot)).rejects.toThrow(message);
  });

  it("reports an action no definition names even when a query names the same ID", async () => {
    const appRoot = checkedApp();
    writeResource(appRoot, "data_app/stale.yaml", actionFile(QUESTION));

    await expect(checkResources(appRoot)).rejects.toThrow(
      "collections/data_apps/data_app/stale.yaml is a resource that is not referenced anywhere.",
    );
  });

  it("reports a question file without an entity ID even when a definition lacks one too", async () => {
    const appRoot = checkedApp();
    fs.appendFileSync(
      path.join(appRoot, "queries/orders.query.ts"),
      `export const Products = defineQuery({ source: { type: "table", id: 2 } });\n`,
    );
    writeResource(appRoot, "data_app/unnamed.yaml", {
      name: "Unnamed",
      type: "question",
      collection_id: COLLECTION,
      "serdes/meta": [{ model: "Card" }],
    });

    await expect(checkResources(appRoot)).rejects.toThrow(
      "collections/data_apps/data_app/unnamed.yaml is a resource that is not referenced anywhere.",
    );
  });

  it("reads the files of an app under the repository's data_apps/", async () => {
    await expect(
      checkResources(checkedApp({ underDataApps: true })),
    ).resolves.toBeUndefined();
  });

  it("leaves a card in another collection alone", async () => {
    const appRoot = checkedApp();
    writeResource(appRoot, "other/stale.yaml", {
      ...cardFile("otherQuestionEntity01", "question"),
      collection_id: "otherCollectionEntit1",
    });

    await expect(checkResources(appRoot)).resolves.toBeUndefined();
  });

  it("fails for a manifest that names no collection", async () => {
    const appRoot = checkedApp();
    fs.writeFileSync(
      path.join(appRoot, "data_app.yaml"),
      "name: Shop\nslug: shop\npath: dist/index.js\n",
    );

    await expect(checkResources(appRoot)).rejects.toThrow(
      "data_app.yaml names no collection.",
    );
  });

  it("fails for a collection whose file is missing", async () => {
    const appRoot = checkedApp();
    fs.rmSync(path.join(appRoot, "collections/data_apps/data_app.yaml"));

    await expect(checkResources(appRoot)).rejects.toThrow(
      `data_app.yaml names collection ${COLLECTION}, which no file in collections/data_apps/ holds.`,
    );
  });

  it("reports every problem at once", async () => {
    const appRoot = checkedApp();
    fs.rmSync(path.join(appRoot, "collections/data_apps/data_app/orders.yaml"));
    fs.rmSync(path.join(appRoot, "collections/data_apps/data_app/create.yaml"));

    const error = await checkResources(appRoot).catch((e: Error) => e);
    expect(String(error)).toContain(`saved question ${QUESTION}`);
    expect(String(error)).toContain(`action ${ACTION}`);
  });
});
