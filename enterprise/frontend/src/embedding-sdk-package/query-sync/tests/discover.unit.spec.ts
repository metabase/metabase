import fs from "node:fs";
import path from "node:path";

import { discoverQueries } from "../discover";
import { checkQuerySync } from "../sync";

import { makeApp, setupQuerySyncTests, writeQuery } from "./setup";

describe("query discovery", () => {
  setupQuerySyncTests();

  it("discovers direct named definitions and rejects copied IDs", async () => {
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
