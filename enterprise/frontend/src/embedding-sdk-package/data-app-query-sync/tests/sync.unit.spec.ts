import path from "node:path";

import { syncResources } from "../sync";

import { makeApp, setupResourceSyncTests } from "./setup";

describe("query synchronization", () => {
  setupResourceSyncTests();

  it("identifies the request that failed", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("Not found.", {
        status: 404,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      syncResources({
        appRoot,
        metabaseUrl: "http://metabase.test",
        apiKey: "secret",
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      `Metabase returned 404 for POST http://metabase.test/api/apps/${slug}/draft: Not found.`,
    );
  });
});
