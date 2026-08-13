import fs from "node:fs";
import path from "node:path";

import { injectSavedQuestionId } from "../ast/query-source";
import { discoverQueries } from "../discover";
import { checkQuerySync } from "../sync";

import { makeApp, setupQuerySyncTests, writeQuery } from "./setup";

describe("query discovery", () => {
  setupQuerySyncTests();

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

    injectSavedQuestionId(query, 20);

    const contents = fs.readFileSync(filePath, "utf8");
    expect(contents).toContain("savedQuestionSourceId: 20");
    expect(contents).not.toContain('savedQuestionSourceId": 10');
  });

  it("fails a read-only build check when source and lockfile drift", async () => {
    const appRoot = makeApp();
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 }, limit: 5 });`,
    );
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: 1,
          hash: `v1:sha256:${"0".repeat(64)}`,
          savedQuestionSourceId: 10,
        },
      ]),
    );
    await expect(checkQuerySync(appRoot)).rejects.toThrow(
      "is not synchronized",
    );
  });
});
