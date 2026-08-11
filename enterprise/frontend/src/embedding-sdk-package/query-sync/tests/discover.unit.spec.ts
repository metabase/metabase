import { discoverQueries } from "../discover";

import { makeApp, writeQuery } from "./setup";

describe("query discovery", () => {
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

  it("rejects definitions that are not direct named exports", async () => {
    const appRoot = makeApp();

    writeQuery(
      appRoot,
      `const query = defineQuery({ source: { type: "table", id: 1 } });
       export { query as Orders };`,
    );

    await expect(discoverQueries(appRoot)).rejects.toThrow(
      "must directly initialize a named exported variable",
    );
  });

  it("rejects definitions whose evaluation is not deterministic", async () => {
    const appRoot = makeApp();

    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ source: { type: "table", id: 1 }, limit: Math.random() });`,
    );

    await expect(discoverQueries(appRoot)).rejects.toThrow(
      "Orders is not deterministic",
    );
  });
});
