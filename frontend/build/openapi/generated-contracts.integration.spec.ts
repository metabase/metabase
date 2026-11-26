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
test("checks requests against the generated measure, dashboard, cache and glossary operations", () => {
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
