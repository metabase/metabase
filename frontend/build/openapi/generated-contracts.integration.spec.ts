import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";

import { checkContracts } from "./contracts";
import { GENERATED_DECLARATIONS_PATH } from "./paths";
import {
  ENDPOINT_BUILDER,
  cleanupFixtures,
  programFrom,
} from "./test-fixtures";

after(cleanupFixtures);

// The API Contracts workflow runs this after generating declarations from this revision's backend.
test("checks the client against generated backend operations", () => {
  const { program, files, root } = programFrom(
    {
      "endpoint.ts": `${ENDPOINT_BUILDER}
      const api = {
        missingMeasureBody: builder.query<void, void>({
          query: () => ({ method: "POST", url: "/api/measure" }),
        }),
        optionalDashboardBody: builder.query<void, void>({
          query: () => ({ method: "POST", url: "/api/dashboard/save" }),
        }),
        dashboardPage: builder.query<void, void>({
          query: () => ({ method: "POST", url: "/api/dashboard/save", params: {limit: 2} }),
        }),
        timezones: builder.query<void, void>({
          query: () => "/api/setting/available-timezones",
        }),
        deleteAction: builder.query<null, number>({
          query: id => ({ method:"DELETE", url: \`/api/action/\${id}\` }),
        }),
        archived: builder.query<void, void>({
          query: () => ({url: "/api/action", params: {archived: "true" as const}}),
        }),
        badTable: builder.query<void, void>({
          query: () => ({method:"POST", url:"/api/mt/gtap/validate",body:{table_id:NaN}}),
        }),
        cachePage: builder.query<void, void>({
          query: () => ({ url: "/api/cache", params: { limit: 10, offset: 20 } }),
        }),
        glossarySearch: builder.query<void, void>({
          query: () => ({ url: "/api/glossary", params: { search: "sales" } }),
        }),
      };`,
      "types.gen.d.ts": readFileSync(GENERATED_DECLARATIONS_PATH, "utf8"),
    },
    { checked: ["endpoint.ts"] },
  );
  const results = checkContracts({
    program,
    root,
    endpointFiles: [files["endpoint.ts"] ?? ""],
    generatedFile: files["types.gen.d.ts"] ?? "",
  });
  const expected = {
    "api:missingMeasureBody:request.body": "mismatch",
    "api:optionalDashboardBody:request.body": "compatible",
    "api:dashboardPage:request.query": "mismatch",
    "api:timezones:request.path.0": "compatible",
    "api:deleteAction:response.204": "compatible",
    "api:archived:request.query": "compatible",
    "api:badTable:request.body": "mismatch",
    "api:cachePage:request.query": "compatible",
    "api:glossarySearch:request.query": "compatible",
  };
  for (const [id, status] of Object.entries(expected)) {
    const result = results.find((result) => result.id === id);
    assert.equal(
      result?.status,
      status,
      `${id}: ${result?.message ?? "missing result"}`,
    );
  }
});
