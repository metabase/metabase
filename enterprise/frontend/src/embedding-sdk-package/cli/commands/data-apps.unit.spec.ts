import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import {
  makeApp,
  setupResourceTests,
  writeAction,
  writeQuery,
  writeResource,
} from "../../data-app-resources/tests/setup";

import { addDataAppsCommands } from "./data-apps";

const QUESTION = "questionEntityId00010";
const ACTION_COPY = "actionCopyEntityId001";
const QUESTION_PATH =
  "collections/data_apps/data_app/orders_questionEntityId00010.yaml";

async function run(...args: string[]) {
  const program = new Command();
  addDataAppsCommands(program);
  await program.parseAsync(["node", "cli", "data-apps", ...args]);
}

function appWithQuery() {
  const appRoot = makeApp();
  writeQuery(
    appRoot,
    `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 } });`,
  );
  return appRoot;
}

describe("data app commands", () => {
  setupResourceTests();

  let stdout: jest.SpyInstance;

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  const printed = () =>
    stdout.mock.calls.map(([chunk]) => String(chunk)).join("");

  it("regenerates the collection's files for the definitions in the app root", async () => {
    const appRoot = appWithQuery();
    writeAction(
      appRoot,
      `export const Create = defineAction({ copiedActionEntityId: "${ACTION_COPY}", action: { id: 51, parameters: [] } });`,
    );
    fs.writeFileSync(
      path.join(appRoot, ".env.local"),
      "DATA_APP_MB_URL=http://metabase.test\nDATA_APP_MB_API_KEY=mb_test_key\n",
    );
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          queries: [
            {
              file: "orders_questionEntityId00010.yaml",
              yaml: "name: Orders\n",
            },
          ],
          actions: [{ file: "create.yaml", yaml: "name: Create\n" }],
          metrics: [],
        }),
      ),
    );

    await run("write-resources", "--app-root", appRoot);

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).actions).toEqual(
      [
        {
          action_id: 51,
          entity_id: ACTION_COPY,
          collection_id: "appCollectionEntity01",
        },
      ],
    );
    expect(fs.readFileSync(path.join(appRoot, QUESTION_PATH), "utf8")).toBe(
      "name: Orders\n",
    );
    expect(printed()).toBe(
      `Wrote ${QUESTION_PATH}\nWrote collections/data_apps/data_app/create.yaml\n`,
    );
  });

  it("confirms resources that back every definition", async () => {
    const appRoot = appWithQuery();
    writeResource(appRoot, "data_app/orders.yaml", {
      name: "Orders",
      type: "question",
      entity_id: QUESTION,
      "serdes/meta": [{ model: "Card", id: QUESTION }],
    });

    await run("check-resources", "--app-root", appRoot);

    expect(printed()).toBe(
      "The app's collection files back every definition.\n",
    );
  });

  it("fails when a definition's resource is missing", async () => {
    const appRoot = appWithQuery();

    await expect(run("check-resources", "--app-root", appRoot)).rejects.toThrow(
      `queries/orders.query.ts:Orders names saved question ${QUESTION}, which no file in collections/data_apps/ holds in the app's collection.`,
    );
    expect(printed()).toBe("");
  });
});
