import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getQuerySyncCredentials } from "../env";

import { makeApp } from "./setup";

describe("query sync credentials", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loads credentials from the repository .env.local", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "query-sync-env-"));
    const appRoot = path.join(repoRoot, "data_apps/orders");
    fs.mkdirSync(appRoot, { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, ".env.local"),
      "DATA_APP_MB_URL=http://metabase.test\nDATA_APP_MB_API_KEY=file-key\n",
    );
    jest.replaceProperty(process, "env", {});

    expect(getQuerySyncCredentials(appRoot)).toEqual({
      metabaseUrl: "http://metabase.test",
      apiKey: "file-key",
    });
  });

  it("prefers process environment credentials", () => {
    const appRoot = makeApp();
    fs.writeFileSync(
      path.join(appRoot, ".env.local"),
      "DATA_APP_MB_URL=http://file.test\nDATA_APP_MB_API_KEY=file-key\n",
    );
    jest.replaceProperty(process, "env", {
      DATA_APP_MB_URL: "http://process.test",
      DATA_APP_MB_API_KEY: "process-key",
    });

    expect(getQuerySyncCredentials(appRoot)).toEqual({
      metabaseUrl: "http://process.test",
      apiKey: "process-key",
    });
  });
});
